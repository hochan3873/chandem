import json,re,sys
p='public/langbang/data.js'
s=open(p,encoding='utf-8',newline='').read()
tbl=json.loads(sys.argv[1]); key=sys.argv[2]  # n or hell
m=re.search(r"export const REC_ADJ = \{ n: (\{[^\n]*?\}), hell: (\{[^\n]*?\}) \};",s)
assert m
n=json.loads(m.group(1)); h=json.loads(m.group(2))
(n if key=='n' else h).clear()
(n if key=='n' else h).update({str(k):v for k,v in sorted(tbl.items(), key=lambda kv:int(kv[0]))})
new="export const REC_ADJ = { n: %s, hell: %s };"%(json.dumps(n,separators=(',',':')),json.dumps(h,separators=(',',':')))
s=s[:m.start()]+new+s[m.end():]
open(p,'w',encoding='utf-8',newline='').write(s)
