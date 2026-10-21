const fs=require('fs');
const h=fs.readFileSync('C:\\Users\\venub\\OneDrive\\Documents\\Default Project\\ihateloom\\features.html','utf8');
const i=h.indexOf('nono');
console.log(h.slice(Math.max(0,i-700), i+200));
