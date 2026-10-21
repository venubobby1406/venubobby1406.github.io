const fs=require('fs');
const h=fs.readFileSync('index.html','utf8');
const m=h.match(/<table>[\s\S]*?<\/table>/);
if(!m){console.log('no table');process.exit(0);}
const rows=m[0].match(/<tr>[\s\S]*?<\/tr>/g)||[];
for(const r of rows){
  const cells=(r.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g)||[]).map(c=>c.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim());
  console.log(cells.join(' | '));
}
