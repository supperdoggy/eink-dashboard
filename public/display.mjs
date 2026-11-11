const form=document.getElementById('display-form');
const choices=document.getElementById('dashboard-choices');
const apply=document.getElementById('apply-dashboard');
const check=document.getElementById('check-display');
const message=document.getElementById('selection-status');
const physical=document.getElementById('physical-status');
const names={station:'Little Adventure',mountain:'Daylight Mountain'};
let saved,dirty=false,saving=false,reading=false;
const time=value=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
function show(value) {
  saved=value;
  if(!dirty) {
    const radio=form.querySelector(`input[value="${value.design}"]`);
    if(radio) radio.checked=true;
  }
  choices.disabled=saving;
  apply.disabled=saving;
  const state=value.display||{};
  const shown=state.lastDisplayedDesign||(state.state==='ok'?state.design:null);
  physical.textContent=shown?`${names[shown]||shown}${state.lastSuccess?`, updated at ${time(state.lastSuccess)}`:''}.`:'No completed display refresh is recorded yet.';
  if(saving||dirty) return;
  if(!value.hardwareEnabled) message.textContent='Choice saved here. Open this page on your Pi to control its screen.';
  else if(state.state==='error') message.textContent=`${names[value.design]} is saved. The last refresh failed; the minute timer will retry.`;
  else if(shown!==value.design) message.textContent=`Switching to ${names[value.design]}. Usually within a minute.`;
  else if(['rendering','updating'].includes(state.state)) message.textContent=`${names[value.design]} is selected. Refreshing the screen…`;
  else message.textContent=`${names[value.design]} is on the screen. Your choice is saved.`;
}
async function load() {
  if(reading||saving) return;
  reading=true;check.disabled=true;
  try {
    const response=await fetch('/api/display/settings',{signal:AbortSignal.timeout(15000)});
    const value=await response.json();
    if(!response.ok) throw new Error(value.error||'Cannot read the display choice.');
    show(value);
    document.documentElement.dataset.settingsReady='true';
  } catch(error) {
    message.textContent=`${error.message} Use Check status to try again.`;
    if(!saved) {choices.disabled=true;apply.disabled=true;}
  } finally {reading=false;check.disabled=false;}
}
form.addEventListener('change',()=>{dirty=true;message.textContent='Use this dashboard to save your choice on the Pi.';});
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(saving) return;
  const design=new FormData(form).get('design');
  if(!names[design]) {message.textContent='Choose a dashboard first.';return;}
  saving=true;choices.disabled=true;apply.disabled=true;apply.setAttribute('aria-busy','true');apply.textContent='Saving…';
  try {
    const response=await fetch('/api/display/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({design}),signal:AbortSignal.timeout(15000)});
    const value=await response.json();
    if(!response.ok) throw new Error(value.error||'Cannot save this choice.');
    dirty=false;saving=false;show(value);
  } catch(error) {dirty=false;message.textContent=`${error.message} Use Check status to confirm the saved choice.`;}
  finally {saving=false;choices.disabled=!saved;apply.disabled=!saved;apply.removeAttribute('aria-busy');apply.textContent='Use this dashboard';}
});
check.addEventListener('click',load);
load();
setInterval(load,5000);
