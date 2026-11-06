export function configuredKey(value){
  if(typeof value!=='string')return '';
  const key=value.trim();
  return !key||/replace|your[_ -]?key|填|替换|example|placeholder/i.test(key)?'':key;
}
