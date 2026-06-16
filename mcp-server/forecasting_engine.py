"""
Forecasting Engine for FinancialStocks Dashboard.
Computes technical indicators, executes TimesFM forecast (with statistical fallback),
performs position sizing, and runs historical portfolio backtests.
"""

import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# ---------------------------------------------------------------------------
# Dynamic TimesFM Import & Initializer
# ---------------------------------------------------------------------------
TIMESFM_AVAILABLE = False
_timesfm_model = None

try:
    import torch
    from transformers import TimesFm2_5ModelForPrediction
    TIMESFM_AVAILABLE = True
except Exception as e:
    # Transformers or PyTorch not installed/supported locally
    pass


def is_timesfm_enabled() -> bool:
    """Check if the TimesFM model is available and enabled."""
    return TIMESFM_AVAILABLE


def load_timesfm_model():
    """Load the pre-trained TimesFM model if available (cached)."""
    global _timesfm_model
    if not TIMESFM_AVAILABLE:
        return None
    
    if _timesfm_model is None:
        try:
            # Load the Hugging Face checkpoint
            _timesfm_model = TimesFm2_5ModelForPrediction.from_pretrained(
                "google/timesfm-2.5-200m-transformers",
                device_map="auto"
            )
        except Exception as e:
            print(f"Failed to load TimesFM model: {e}")
            _timesfm_model = None
            
    return _timesfm_model


# ---------------------------------------------------------------------------
# Technical Indicator Calculations (Pure Pandas)
# ---------------------------------------------------------------------------
def compute_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Compute Relative Strength Index."""
    delta = prices.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    # Use exponential moving average for smoothing
    avg_gain = gain.ewm(com=period - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=period - 1, adjust=False).mean()
    
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def compute_macd(prices: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    """Compute MACD, Signal line, and Histogram."""
    ema_fast = prices.ewm(span=fast, adjust=False).mean()
    ema_slow = prices.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    macd_hist = macd_line - signal_line
    return macd_line, signal_line, macd_hist


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all required indicators for forecasting and display."""
    df = df.copy()
    close = df["Close"]
    
    # Moving Averages
    df["SMA_20"] = close.rolling(20).mean()
    df["SMA_50"] = close.rolling(50).mean()
    df["SMA_200"] = close.rolling(200).mean()
    
    # RSI & MACD
    df["RSI"] = compute_rsi(close, 14)
    macd, signal, hist = compute_macd(close, 12, 26, 9)
    df["MACD"] = macd
    df["MACD_Signal"] = signal
    df["MACD_Hist"] = hist
    
    # Historical Volatility (20-day rolling annualized standard deviation of log returns)
    log_returns = np.log(close / close.shift(1))
    df["Volatility"] = log_returns.rolling(20).std() * math.sqrt(252)
    df["Volatility"] = df["Volatility"].fillna(0.20) # 20% default fallback
    
    return df


# ---------------------------------------------------------------------------
# Forecasting Engine: TimesFM or Resilient Fallback
# ---------------------------------------------------------------------------
def run_forecast(history_prices: list[float], dates: list[str], horizon: int = 30) -> dict:
    """
    Generate price forecasts for the given history.
    Outputs point forecasts and uncertainty bands (10% and 90% confidence intervals).
    """
    current_price = history_prices[-1]
    
    # Try TimesFM
    if TIMESFM_AVAILABLE:
        model = load_timesfm_model()
        if model is not None:
            try:
                # TimesFM expects float32 inputs
                past_tensor = [torch.tensor(history_prices, dtype=torch.float32, device=model.device)]
                with torch.no_grad():
                    outputs = model(past_values=past_tensor, return_dict=True)
                
                # Point forecast (mean)
                mean_pred = outputs.mean_predictions[0].cpu().numpy()
                
                # Check for full predictions (quantiles)
                if hasattr(outputs, "full_predictions") and outputs.full_predictions is not None:
                    full_pred = outputs.full_predictions[0].cpu().numpy()
                    # Mapping of standard quantiles: typically 10 quantiles. Index 1 ~ 10%, Index 9 ~ 90%
                    lower_pred = full_pred[:, 1]
                    upper_pred = full_pred[:, -2]
                else:
                    # Fallback to analytical variance sizing if quantiles are not returned
                    std_dev = np.std(np.diff(history_prices))
                    lower_pred = mean_pred - 1.28 * std_dev * np.sqrt(np.arange(1, horizon + 1))
                    upper_pred = mean_pred + 1.28 * std_dev * np.sqrt(np.arange(1, horizon + 1))
                
                # Create future dates
                last_date = datetime.strptime(dates[-1], "%Y-%m-%d")
                future_dates = []
                curr = last_date
                while len(future_dates) < horizon:
                    curr += timedelta(days=1)
                    if curr.weekday() < 5:  # Skip weekends for stocks
                        future_dates.append(curr.strftime("%Y-%m-%d"))
                        
                return {
                    "is_timesfm": True,
                    "future_dates": future_dates,
                    "mean": mean_pred.tolist(),
                    "lower": lower_pred.tolist(),
                    "upper": upper_pred.tolist(),
                }
            except Exception as ex:
                print(f"TimesFM run failed, falling back to statistical engine: {ex}")
    
    # ---------------------------------------------------------
    # Resilient Statistical Fallback (AR + Linear Trend)
    # ---------------------------------------------------------
    n_history = len(history_prices)
    lookback = min(60, n_history)
    
    # Fit Linear Regression on the past lookback prices to get the trend
    x = np.arange(lookback)
    y = np.array(history_prices[-lookback:])
    slope, intercept = np.polyfit(x, y, 1)
    
    # AR(1) component of residuals to handle mean reversion / momentum
    fitted = slope * x + intercept
    residuals = y - fitted
    
    if len(residuals) > 1:
        # AR(1) coefficient: cov(t, t-1) / var(t-1)
        r_t = residuals[1:]
        r_t_1 = residuals[:-1]
        ar_coeff = np.cov(r_t, r_t_1)[0, 1] / (np.var(r_t_1) + 1e-9)
        ar_coeff = np.clip(ar_coeff, -0.9, 0.9)  # Keep stable
    else:
        ar_coeff = 0.5
        
    last_residual = residuals[-1]
    
    # Generate Forecast Projecting Trend + AR Residual
    mean_forecast = []
    lower_forecast = []
    upper_forecast = []
    
    # Compute volatility of residuals for uncertainty estimation
    resid_std = np.std(residuals) if len(residuals) > 1 else (current_price * 0.02)
    
    for i in range(1, horizon + 1):
        # Linear projection
        proj = slope * (lookback + i - 1) + intercept
        # AR correction decay
        decayed_residual = last_residual * (ar_coeff ** i)
        val = proj + decayed_residual
        
        # Uncertainty band expands with sqrt(time) like a random walk
        uncertainty = 1.28 * resid_std * math.sqrt(i)
        
        mean_forecast.append(val)
        lower_forecast.append(val - uncertainty)
        upper_forecast.append(val + uncertainty)
        
    # Future dates (weekdays only)
    last_date = datetime.strptime(dates[-1], "%Y-%m-%d")
    future_dates = []
    curr = last_date
    while len(future_dates) < horizon:
        curr += timedelta(days=1)
        if curr.weekday() < 5:
            future_dates.append(curr.strftime("%Y-%m-%d"))
            
    return {
        "is_timesfm": False,
        "future_dates": future_dates,
        "mean": mean_forecast,
        "lower": lower_forecast,
        "upper": upper_forecast,
    }


# ---------------------------------------------------------------------------
# Position Sizing Module
# ---------------------------------------------------------------------------
def compute_position_sizing(current_price: float, forecast_mean: float, forecast_lower: float, forecast_upper: float, volatility: float, capital: float, target_risk: float = 0.02) -> dict:
    """
    Compute optimal portfolio sizing using Kelly Criterion and Volatility Scaling.
    """
    # 1. Expected Return
    expected_return = (forecast_mean - current_price) / current_price
    
    # 2. Probability of Positive Return (CDF of normal distribution)
    # Estimate standard deviation of the forecast path at horizon
    forecast_std = (forecast_upper - forecast_lower) / (2 * 1.28) # back out standard error
    z_score = expected_return / (forecast_std / current_price + 1e-9)
    
    # Numerical approximation of Normal CDF (error function)
    p_up = 0.5 * (1 + math.erf(z_score / math.sqrt(2)))
    p_up = np.clip(p_up, 0.01, 0.99)
    
    # 3. Kelly Sizing (binary assumption: win/lose with 1:1 odds)
    # Kelly fraction: f* = p - q = 2p - 1
    kelly_fraction = 2 * p_up - 1
    # Limit to positive allocations (long only)
    kelly_size = max(0.0, kelly_fraction)
    
    # 4. Volatility Target Sizing (Risk Parity allocation)
    # Position Size = (Target Risk % * Capital) / (Asset Daily Volatility)
    daily_vol = volatility / math.sqrt(252)
    vol_size = (target_risk / (daily_vol + 1e-9))
    vol_size = min(1.5, vol_size) # cap leverage at 150%
    
    # 5. Suggested Sizes
    kelly_capital_allocated = capital * kelly_size * 0.5 # use Half-Kelly for safety
    vol_capital_allocated = capital * vol_size
    
    suggested_shares_kelly = math.floor(kelly_capital_allocated / current_price)
    suggested_shares_vol = math.floor(vol_capital_allocated / current_price)
    
    # 6. Stop Loss / Take Profit (Standard 1.5 ATR / Volatility bounds)
    sl_pct = max(0.02, daily_vol * 1.5)
    tp_pct = sl_pct * 2.0  # 1:2 risk-to-reward ratio
    
    return {
        "expected_return_pct": round(expected_return * 100, 2),
        "probability_up": round(p_up * 100, 1),
        "kelly_fraction": round(kelly_size, 3),
        "vol_sizing_leverage": round(vol_size, 2),
        "suggested_shares_kelly": max(0, suggested_shares_kelly),
        "suggested_shares_vol": max(0, suggested_shares_vol),
        "stop_loss_price": round(current_price * (1 - sl_pct), 2),
        "take_profit_price": round(current_price * (1 + tp_pct), 2),
        "target_risk_pct": round(target_risk * 100, 1),
        "volatility_ann_pct": round(volatility * 100, 1)
    }


# ---------------------------------------------------------------------------
# Backtesting & Portfolio Simulator
# ---------------------------------------------------------------------------
def run_backtest(df_history: pd.DataFrame, initial_capital: float = 100000.0, target_risk: float = 0.02, rebalance_days: int = 20) -> dict:
    """
    Backtests a monthly (20-day) rebalancing strategy on the past 1 year of data.
    Uses forecast-based Volatility Sizing to buy/sell shares.
    """
    df = df_history.copy().sort_index()
    n_days = len(df)
    
    # Need at least 150 days of lookback for starting the backtest
    start_idx = min(150, n_days // 2)
    if n_days - start_idx < 40:
        start_idx = max(20, n_days - 40)
        
    prices = df["Close"].values
    dates = df["time"].tolist()
    volatilities = df["Volatility"].values
    
    # Strategy portfolios track
    capital = initial_capital
    shares = 0
    cash = initial_capital
    
    # Benchmark portfolio: Buy & Hold
    benchmark_shares = initial_capital / prices[start_idx]
    
    equity_curve = []
    benchmark_curve = []
    trades = []
    
    last_rebalance = -999
    
    for i in range(start_idx, n_days):
        date_str = dates[i]
        price = prices[i]
        vol = volatilities[i]
        
        # Current portfolio values
        portfolio_value = cash + shares * price
        bench_value = benchmark_shares * price
        
        # Rebalance check
        if (i - start_idx) % rebalance_days == 0 or i == start_idx:
            # Generate local statistical forecast on the slice
            slice_prices = prices[max(0, i - 120):i+1].tolist()
            slice_dates = dates[max(0, i - 120):i+1]
            
            # Predict the next 20 days
            fc = run_forecast(slice_prices, slice_dates, horizon=20)
            fc_mean = fc["mean"][-1]
            fc_lower = fc["lower"][-1]
            fc_upper = fc["upper"][-1]
            
            # Run Position Sizing
            sizes = compute_position_sizing(price, fc_mean, fc_lower, fc_upper, vol, portfolio_value, target_risk)
            
            # Target sizing leverage
            target_lev = sizes["vol_sizing_leverage"]
            
            # Bullish check: if forecasted return is negative, reduce allocation
            exp_ret = sizes["expected_return_pct"]
            if exp_ret < 0:
                target_lev = 0.0  # go to cash
            else:
                # scale sizing down slightly if probability is low
                prob = sizes["probability_up"] / 100.0
                if prob < 0.52:
                    target_lev *= 0.5
            
            # Rebalance trade execution
            target_value = portfolio_value * target_lev
            target_shares = math.floor(target_value / price)
            
            # Limit position size to 1.0 (no margin/leverage beyond 100%) for backtest safety
            target_shares = min(target_shares, math.floor(portfolio_value / price))
            
            if target_shares != shares:
                trade_type = "BUY" if target_shares > shares else "SELL"
                trade_qty = abs(target_shares - shares)
                trade_value = trade_qty * price
                
                # Transaction cost (0.1% slippage/brokerage)
                fee = trade_value * 0.001
                
                # Execute trade
                if trade_type == "BUY":
                    cash -= (trade_value + fee)
                    shares = target_shares
                else:
                    cash += (trade_value - fee)
                    shares = target_shares
                    
                portfolio_value = cash + shares * price
                
                trades.append({
                    "date": date_str,
                    "type": trade_type,
                    "shares": trade_qty,
                    "price": round(price, 2),
                    "fee": round(fee, 2),
                    "cash_remaining": round(cash, 2),
                    "portfolio_value": round(portfolio_value, 2)
                })
                
            last_rebalance = i
            
        equity_curve.append({
            "date": date_str,
            "value": round(portfolio_value, 2)
        })
        benchmark_curve.append({
            "date": date_str,
            "value": round(bench_value, 2)
        })
        
    # Calculate performance metrics
    final_val = equity_curve[-1]["value"]
    bench_final_val = benchmark_curve[-1]["value"]
    
    total_return = ((final_val - initial_capital) / initial_capital) * 100
    bench_return = ((bench_final_val - initial_capital) / initial_capital) * 100
    
    # Calculate Sharpe Ratio (Daily returns std)
    vals = [ec["value"] for ec in equity_curve]
    daily_returns = np.diff(vals) / vals[:-1]
    if len(daily_returns) > 1 and np.std(daily_returns) > 0:
        sharpe = (np.mean(daily_returns) / np.std(daily_returns)) * math.sqrt(252)
    else:
        sharpe = 0.0
        
    # Calculate Maximum Drawdown
    peaks = np.maximum.accumulate(vals)
    drawdowns = (peaks - vals) / peaks
    max_dd = np.max(drawdowns) * 100 if len(drawdowns) > 0 else 0.0
    
    # Calculate trade win rate
    wins = 0
    # Match sell trades to evaluate profit
    trade_profits = []
    # Simplified win-rate: what fraction of portfolio rebalances increased its value
    for i in range(1, len(equity_curve)):
        if i % rebalance_days == 0:
            if equity_curve[i]["value"] > equity_curve[i - rebalance_days]["value"]:
                wins += 1
    rebalance_count = max(1, len(equity_curve) // rebalance_days)
    win_rate = (wins / rebalance_count) * 100
    
    return {
        "metrics": {
            "total_return_pct": round(total_return, 2),
            "benchmark_return_pct": round(bench_return, 2),
            "sharpe_ratio": round(sharpe, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "win_rate_pct": round(win_rate, 2),
            "total_trades": len(trades)
        },
        "equity_curve": equity_curve,
        "benchmark_curve": benchmark_curve,
        "trades": trades
    }
