"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { NSE200, SECTORS, type StockEntry } from "@/data/nse200";

interface StockPickerProps {
  value: string;
  onChange: (symbol: string) => void;
}

export function StockPicker({ value, onChange }: StockPickerProps) {
  const [open, setOpen] = useState(false);
  const [sector, setSector] = useState<string | null>(null);

  const filtered = sector ? NSE200.filter((s) => s.sector === sector) : NSE200;
  const current = NSE200.find((s) => s.symbol === value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Stock</span>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-64 justify-between bg-zinc-900 border-zinc-700 hover:bg-zinc-800 hover:border-violet-500 text-sm"
            >
              {current ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono text-violet-300">{current.symbol.replace(".NS", "")}</span>
                  <span className="text-zinc-400 truncate text-xs">{current.name}</span>
                </span>
              ) : (
                <span className="text-zinc-500">Search NSE 200…</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0 bg-zinc-900 border-zinc-700" align="start">
            <Command className="bg-zinc-900">
              <CommandInput
                placeholder="Search ticker or company…"
                className="h-9 bg-zinc-900 text-zinc-100"
              />
              <CommandList className="max-h-64 overflow-y-auto">
                <CommandEmpty className="text-zinc-500 text-sm py-3 text-center">
                  No matching stocks found.
                </CommandEmpty>
                <CommandGroup>
                  {filtered.map((stock: StockEntry) => (
                    <CommandItem
                      key={stock.symbol}
                      value={`${stock.symbol} ${stock.name}`}
                      onSelect={() => {
                        onChange(stock.symbol);
                        setOpen(false);
                      }}
                      className="cursor-pointer hover:bg-zinc-800 data-[selected=true]:bg-zinc-800"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 text-violet-400",
                          value === stock.symbol ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-mono text-sm text-violet-300">
                          {stock.symbol.replace(".NS", "")}
                        </span>
                        <span className="text-xs text-zinc-400">{stock.name}</span>
                      </div>
                      <Badge className="ml-auto text-[10px] py-0 bg-zinc-800 text-zinc-400 border-zinc-700">
                        {stock.sector}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {/* Sector filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setSector(null)}
          className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border",
            sector === null
              ? "bg-violet-600 border-violet-500 text-white"
              : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500"
          )}
        >
          All
        </button>
        {SECTORS.map((s) => (
          <button
            key={s}
            onClick={() => setSector(sector === s ? null : s)}
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border",
              sector === s
                ? "bg-violet-600 border-violet-500 text-white"
                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500"
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
