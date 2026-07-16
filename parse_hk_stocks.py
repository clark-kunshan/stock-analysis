#!/usr/bin/env python3
"""
Parse HK stock data from compact text file and output clean JSON.
Input format: each line is "category|code1:name1|code2:name2|..."
"""

import json
import os

INPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hk_stocks_data.txt")
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hk_stocks.json")

def parse_data():
    stocks = []
    seen_codes = set()

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            parts = line.split("|")
            if len(parts) < 2:
                continue

            category = parts[0]  # "mainboard" or "gem"

            for pair in parts[1:]:
                # Split on first colon only (name may contain colons)
                idx = pair.find(":")
                if idx == -1:
                    continue
                code = pair[:idx].strip()
                name = pair[idx+1:].strip()

                if not code or not name:
                    continue
                if code in seen_codes:
                    continue

                # Skip placeholder entries like STOCK1018
                if name.startswith("STOCK") and name[5:].isdigit():
                    continue

                seen_codes.add(code)

                # Determine if R-share (人民币柜台)
                # R-shares have names ending with -R, -WR, -SR, -SWR, -DRS
                # Or code starts with 8 but not 08 (GEM board is 08xxx)
                is_r_share = (
                    name.endswith("-R") or name.endswith("-WR") or
                    name.endswith("-SR") or name.endswith("-SWR") or
                    name.endswith("-DRS") or
                    (code[0] == '8' and not code.startswith("08") and category == "mainboard")
                )

                # Determine sub-category
                if is_r_share:
                    sub_category = "r_share"
                elif "-SW" in name:
                    sub_category = "w_vrm"  # 同股不同权+二次上市
                elif "-W" in name and "-WR" not in name:
                    sub_category = "w_vrm"  # 同股不同权
                elif "-B" in name:
                    sub_category = "b_share"  # 未盈利生物科技
                elif name.endswith("-S") and "-SW" not in name:
                    sub_category = "secondary"  # 第二上市
                else:
                    sub_category = "ordinary"

                stocks.append({
                    "code": code,
                    "name": name,
                    "market": "HKEX",
                    "category": category,
                    "subCategory": sub_category,
                    "isRShare": is_r_share
                })

    return stocks

def main():
    stocks = parse_data()

    # Sort by code
    stocks.sort(key=lambda s: s["code"])

    # Statistics
    mainboard = [s for s in stocks if s["category"] == "mainboard"]
    gem = [s for s in stocks if s["category"] == "gem"]
    r_shares = [s for s in stocks if s["isRShare"]]

    print(f"=== HK Stocks Summary ===")
    print(f"Total: {len(stocks)}")
    print(f"Mainboard: {len(mainboard)}")
    print(f"GEM: {len(gem)}")
    print(f"R-shares: {len(r_shares)}")
    print(f"Ordinary: {len([s for s in stocks if s['subCategory'] == 'ordinary'])}")
    print(f"B-shares: {len([s for s in stocks if s['subCategory'] == 'b_share'])}")
    print(f"W/VRM: {len([s for s in stocks if s['subCategory'] == 'w_vrm'])}")
    print(f"Secondary: {len([s for s in stocks if s['subCategory'] == 'secondary'])}")

    # Write JSON
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(stocks, f, ensure_ascii=False, indent=2)

    print(f"\nSaved to: {OUTPUT_FILE}")
    print(f"File size: {os.path.getsize(OUTPUT_FILE) / 1024:.1f} KB")

    # Print samples
    print(f"\nFirst 5:")
    for s in stocks[:5]:
        print(f"  {s['code']} {s['name']} ({s['category']}, {s['subCategory']})")
    print(f"\nLast 5:")
    for s in stocks[-5:]:
        print(f"  {s['code']} {s['name']} ({s['category']}, {s['subCategory']})")

if __name__ == "__main__":
    main()
