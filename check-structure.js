const fs=require('fs'), path=require('path');
const SITE='C:\\Users\\venub\\OneDrive\\Documents\\Default Project\\ihateloom';
for(const f of ['tools.html','features.html','record.html','about.html','status.html']){
  const h=fs.readFileSync(path.join(SITE,f),'utf8');
  const sec=(h.match(/<section/g)||[]).length, end=(h.match(/<\/section>/g)||[]).length;
  const art=(h.match(/<article/g)||[]).length, artEnd=(h.match(/<\/article>/g)||[]).length;
  const main=(h.match(/<main>/g)||[]).length, mainEnd=(h.match(/<\/main>/g)||[]).length;
  console.log(f.padEnd(18)+' section '+sec+'/'+end+'  article '+art+'/'+artEnd+'  main '+main+'/'+mainEnd);
}
