import akshare as ak

# 获取分红送股数据
dividend = ak.stock_dividend_cninfo(symbol='600900')
recent = dividend.tail(10)

# 将列名打印出来
print("Columns:", list(dividend.columns))
print("\nRecent dividends:")
for idx, row in recent.iterrows():
    cols = list(row.index)
    vals = list(row.values)
    print(f"Row {idx}:")
    for c, v in zip(cols, vals):
        print(f"  {c}: {v}")
    print()
