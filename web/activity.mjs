export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export async function activityApi(path,body) {
  let response;
  try {
    response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',
      headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  } catch {
    const error=new Error('暂时无法连接工坊。请检查网络后重试；已保存的锻造进度会保留。');error.code='network_error';throw error;
  }
  let data;
  try {data=await response.json();}catch {data={error:'正式场暂时不可用，请稍后重试。'};}
  if(!response.ok){const error=new Error(data.error??'请求失败，请稍后重试。');error.status=response.status;error.code=data.code;throw error;}
  return data;
}
