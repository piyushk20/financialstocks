"""
Forecasting Engine for FinancialStocks Dashboard.
Computes technical indicators, executes TimesFM forecast (with statistical fallback),
performs position sizing, and runs historical portfolio backtests.
"""

import math
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dynamic TimesFM Import & Initializer
# ---------------------------------------------------------------------------
TIMESFM_AVAILABLE = False
_timesfm_model = None

try:
    import torch
    from transformers import TimesFm2_5ModelForPrediction
    TIMESFM_AVAILABLE = True
except Exception:
    # Transformers or PyTorch not installed/supported locally — stat fallback will be used
    pass


def is_timesfm_enabled() -> bool:
    """Check if the TimesFM model is available and enabled."""
    return TIMESFM_AVAILABLE


def load_timesfm_model():
    """Load the pre-trained TimesFM model if available (module-level singleton)."""
    global _timesfm_model
    if not TIMESFM_AVAILABLE:
        return None

    if _timesfm_model is None:
        try:
            _timesfm_model = TimesFm2_5ModelForPrediction.from_pretrained(
                "google/timesfm-2.5-200m-transformers",
                device_map="auto"
            )
        except Exception as e:
            logger.warning("Failed to load TimesFM model: %s", e)
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

    # Historical Volatility (20-day rolling annualized std of log returns)
    log_returns = np.log(close / close.shift(1))
    df["Volatility"] = log_returns.rolling(20).std() * math.sqrt(252)
    df["Volatility"] = df["Volatility"].fillna(0.20)  # 20% default fallback

    return df


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_date(date_str: str) -> datetime:
    """Parse a date string that may include a time component."""
    return datetime.strptime(date_str[:10], "%Y-%m-%d")


def _future_weekdays(last_date: datetime, horizon: int) -> list[str]:
    """Generate `horizon` future weekday date strings."""
    dates: list[str] = []
    curr = last_date
    while len(dates) < horizon:
        curr += timedelta(days=1)
        if curr.weekday() < 5:
            dates.append(curr.strftime("%Y-%m-%d"))
    return dates


# ---------------------------------------------------------------------------
# Forecasting Engine: TimesFM or Resilient Fallback
# ---------------------------------------------------------------------------
def run_forecast(history_prices: list[float], dates: list[str], horizon: int = 30) -> dict:
    """
    Generate price forecasts for the given history.
    Returns point forecasts and 80% confidence intervals.
    Falls back gracefully from TimesFM → statistical AR model.
    """
    current_price = history_prices[-1]
    last_date = _parse_date(dates[-1])

    # Try TimesFM -------------------------------------------------------
    if TIMESFM_AVAILABLE:
        model = load_timesfm_model()
        if model is not None:
            try:
                past_tensor = [torch.tensor(history_prices, dtype=torch.float32, device=model.device)]
                with torch.no_grad():
                    outputs = model(past_values=past_tensor, return_dict=True)

                mean_pred = outputs.mean_predictions[0].cpu().numpy()

                if hasattr(outputs, "full_predictions") and outputs.full_predictions is not None:
                    full_pred = outputs.full_predictions[0].cpu().numpy()
                    lower_pred = full_pred[:, 1]
                    upper_pred = full_pred[:, -2]
                else:
                    std_dev = np.std(np.diff(history_prices))
                    t = np.arange(1, horizon + 1)
                    lower_pred = mean_pred - 1.28 * std_dev * np.sqrt(t)
                    upper_pred = mean_pred + 1.28 * std_dev * np.sqrt(t)

                return {
                    "is_timesfm": True,
                    "future_dates": _future_weekdays(last_date, horizon),
                    "mean": mean_pred.tolist(),
                    "lower": lower_pred.tolist(),
                    "upper": upper_pred.tolist(),
                }
            except Exception as ex:
                logger.warning("TimesFM run failed, using statistical fallback: %s", ex)

    # Resilient Statistical Fallback (AR + Linear Trend) ---------------
    n_history = len(history_prices)
    lookback = min(60, n_history)

    x = np.arange(lookback)
    y = np.array(history_prices[-lookback:])
    slope, intercept = np.polyfit(x, y, 1)

    fitted = slope * x + intercept
    residuals = y - fitted

    if len(residuals) > 1:
        r_t = residuals[1:]
        r_t_1 = residuals[:-1]
        ar_coeff = np.cov(r_t, r_t_1)[0, 1] / (np.var(r_t_1) + 1e-9)
        ar_coeff = float(np.clip(ar_coeff, -0.9, 0.9))
    else:
        ar_coeff = 0.5

    last_residual = float(residuals[-1])
    resid_std = float(np.std(residuals)) if len(residuals) > 1 else current_price * 0.02

    mean_forecast, lower_forecast, upper_forecast = [], [], []
    for i in range(1, horizon + 1):
        proj = slope * (lookback + i - 1) + intercept
        val = proj + last_residual * (ar_coeff ** i)
        uncertainty = 1.28 * resid_std * math.sqrt(i)
        mean_forecast.append(float(val))
        lower_forecast.append(float(val - uncertainty))
        upper_forecast.append(float(val + uncertainty))

    return {
        "is_timesfm": False,
        "future_dates": _future_weekdays(last_date, horizon),
        "mean": mean_forecast,
        "lower": lower_forecast,
        "upper": upper_forecast,
    }


# ---------------------------------------------------------------------------
# Position Sizing Module
# ---------------------------------------------------------------------------
def compute_position_sizing(
    current_price: float,
    forecast_mean: float,
    forecast_lower: float,
    forecast_upper: float,
    volatility: float,
    capital: float,
    target_risk: float = 0.02,
) -> dict:
    """
    Compute optimal portfolio sizing using Kelly Criterion and Volatility Scaling.

    Args:
        current_price: Latest close price.
        forecast_mean / lower / upper: Forecast horizon end-points.
        volatility: Annualized realized volatility (e.g. 0.18 = 18%).
        capital: Simulated portfolio capital in INR.
        target_risk: Target daily portfolio volatility fraction (e.g. 0.02 = 2%).
    """
    expected_return = (forecast_mean - current_price) / current_price

    # Probability of positive return via Normal CDF approximation
    forecast_std = (forecast_upper - forecast_lower) / (2 * 1.28)
    z_score = expected_return / (forecast_std / current_price + 1e-9)
    p_up = float(np.clip(0.5 * (1 + math.erf(z_score / math.sqrt(2))), 0.01, 0.99))

    # Half-Kelly (conservative)
    kelly_size = max(0.0, 2 * p_up - 1)

    # Volatility Target Sizing
    daily_vol = volatility / math.sqrt(252)
    vol_size = float(np.clip(target_risk / (daily_vol + 1e-9), 0, 1.5))

    kelly_capital = capital * kelly_size * 0.5
    vol_capital = capital * vol_size

    suggested_kelly = max(0, int(kelly_capital / current_price))
    suggested_vol = max(0, int(vol_capital / current_price))

    sl_pct = max(0.02, daily_vol * 1.5)
    tp_pct = sl_pct * 2.0

    return {
        "expected_return_pct": round(expected_return * 100, 2),
        "probability_up": round(p_up * 100, 1),
        "kelly_fraction": round(kelly_size, 3),
        "vol_sizing_leverage": round(vol_size, 2),
        "suggested_shares_kelly": suggested_kelly,
        "suggested_shares_vol": suggested_vol,
        "stop_loss_price": round(current_price * (1 - sl_pct), 2),
        "take_profit_price": round(current_price * (1 + tp_pct), 2),
        "target_risk_pct": round(target_risk * 100, 1),
        "volatility_ann_pct": round(volatility * 100, 1),
    }


# ---------------------------------------------------------------------------
# Backtesting & Portfolio Simulator
# ---------------------------------------------------------------------------
def run_backtest(
    df_history: pd.DataFrame,
    initial_capital: float = 100_000.0,
    target_risk: float = 0.02,
    rebalance_days: int = 20,
) -> dict:
    """
    Backtest a monthly (20-day) volatility-sizing strategy on the past year of data
    and compare against a Buy-and-Hold benchmark.
    """
    df = df_history.copy().sort_index()

    # Ensure 'time' column is present (guard against index-only DataFrames)
    if "time" not in df.columns:
        df["time"] = df.index.astype(str).str[:10]

    n_days = len(df)
    start_idx = min(150, n_days // 2)
    if n_days - start_idx < 40:
        start_idx = max(20, n_days - 40)

    prices = df["Close"].values
    dates = df["time"].tolist()
    volatilities = df["Volatility"].values

    # Guard against zero/NaN start price
    start_price = float(prices[start_idx])
    if not (start_price > 0 and np.isfinite(start_price)):
        logger.warning("run_backtest: invalid start price %s — returning empty backtest", start_price)
        return {"metrics": {}, "equity_curve": [], "benchmark_curve": [], "trades": []}

    shares = 0
    cash = initial_capital
    benchmark_shares = initial_capital / start_price

    equity_curve, benchmark_curve, trades = [], [], []

    for i in range(start_idx, n_days):
        date_str = dates[i]
        price = float(prices[i])
        vol = float(volatilities[i])

        portfolio_value = cash + shares * price
        bench_value = benchmark_shares * price

        # Monthly rebalance
        if (i - start_idx) % rebalance_days == 0 or i == start_idx:
            slice_prices = prices[max(0, i - 120): i + 1].tolist()
            slice_dates = dates[max(0, i - 120): i + 1]

            fc = run_forecast(slice_prices, slice_dates, horizon=20)
            sizes = compute_position_sizing(
                price, fc["mean"][-1], fc["lower"][-1], fc["upper"][-1],
                vol, portfolio_value, target_risk
            )

            target_lev = sizes["vol_sizing_leverage"]
            if sizes["expected_return_pct"] < 0:
                target_lev = 0.0
            elif (sizes["probability_up"] / 100.0) < 0.52:
                target_lev *= 0.5

            target_value = portfolio_value * target_lev
            target_shares = min(int(target_value / price), int(portfolio_value / price))

            if target_shares != shares:
                trade_type = "BUY" if target_shares > shares else "SELL"
                trade_qty = abs(target_shares - shares)
                trade_value = trade_qty * price
                fee = trade_value * 0.001  # 0.1% brokerage

                if trade_type == "BUY":
                    cash -= trade_value + fee
                else:
                    cash += trade_value - fee

                shares = target_shares
                portfolio_value = cash + shares * price

                trades.append({
                    "date": date_str,
                    "type": trade_type,
                    "shares": trade_qty,
                    "price": round(price, 2),
                    "fee": round(fee, 2),
                    "cash_remaining": round(cash, 2),
                    "portfolio_value": round(portfolio_value, 2),
                })

        equity_curve.append({"date": date_str, "value": round(portfolio_value, 2)})
        benchmark_curve.append({"date": date_str, "value": round(bench_value, 2)})

    if not equity_curve:
        return {"metrics": {}, "equity_curve": [], "benchmark_curve": [], "trades": []}

    final_val = equity_curve[-1]["value"]
    bench_final = benchmark_curve[-1]["value"]

    total_return = ((final_val - initial_capital) / initial_capital) * 100
    bench_return = ((bench_final - initial_capital) / initial_capital) * 100

    vals = [ec["value"] for ec in equity_curve]
    daily_returns = np.diff(vals) / (np.array(vals[:-1]) + 1e-9)
    std_dr = float(np.std(daily_returns))
    sharpe = float((np.mean(daily_returns) / std_dr) * math.sqrt(252)) if std_dr > 0 else 0.0

    peaks = np.maximum.accumulate(vals)
    drawdowns = (np.array(peaks) - np.array(vals)) / (np.array(peaks) + 1e-9)
    max_dd = float(np.max(drawdowns)) * 100

    # Win rate: fraction of rebalance periods where portfolio grew
    rebalance_indices = list(range(0, len(equity_curve), rebalance_days))
    wins = sum(
        1 for j in range(1, len(rebalance_indices))
        if equity_curve[rebalance_indices[j]]["value"] > equity_curve[rebalance_indices[j - 1]]["value"]
    )
    win_rate = (wins / max(1, len(rebalance_indices) - 1)) * 100

    return {
        "metrics": {
            "total_return_pct": round(total_return, 2),
            "benchmark_return_pct": round(bench_return, 2),
            "sharpe_ratio": round(sharpe, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "win_rate_pct": round(win_rate, 2),
            "total_trades": len(trades),
        },
        "equity_curve": equity_curve,
        "benchmark_curve": benchmark_curve,
        "trades": trades,
    }
