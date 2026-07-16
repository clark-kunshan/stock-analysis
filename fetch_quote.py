import urllib.request
import json

# 腾讯行情接口
url = 'https://qt.gtimg.cn/q=sh600900'
response = urllib.request.urlopen(url, timeout=10)
text = response.read().decode('gbk')
import re
match = re.search(r'v_sh\d+="(.*?)"', text)
parts = match[1].split('~')
price = float(parts[3])
market_cap = float(parts[44])
pb = float(parts[46])
year_change = float(parts[43])
change_percent = float(parts[31])

# 东方财富财务数据接口 - 获取股息率
div_url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAIN&columns=SECURITY_CODE,ZXGXL&filter=(SECURITY_CODE="600900")&pageNumber=1&pageSize=1&source=WEB&client=WEB'
response2 = urllib.request.urlopen(div_url, timeout=10)
data2 = json.loads(response2.read().decode('utf-8'))

print('price:', price)
print('market_cap:', market_cap)
print('pb:', pb)
print('year_change:', year_change)
print('change_percent:', change_percent)
if data2.get('result') and data2['result'].get('data'):
    item = data2['result']['data'][0]
    print('div_yield:', item.get('ZXGXL', 'N/A'))
    print('dps:', item.get('MGJ', 'N/A'))
else:
    print('div_yield: N/A')
