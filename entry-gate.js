/* Ambrosia entry gate — runs on every page before anything else is usable.
   Vanilla DOM, independent of the page runtime, so a direct link to a product
   page is gated exactly like the homepage. Remembered for 30 days, then asked
   again. Dispatches `ambrosia:gate-confirmed` on document when passed. */
(function () {
  if (window.__ambrosiaGate) return;
  window.__ambrosiaGate = true;
  var KEY = 'ambrosia-entry-ack-v2', AT = 'ambrosia-entry-ack-at-v2', ROLE = 'ambrosia-entry-role', DAYS = 30;
  function acked() {
    try {
      var ts = Number(localStorage.getItem(AT) || 0);
      return localStorage.getItem(KEY) === 'yes' && ts > 0 && Date.now() - ts < DAYS * 86400000;
    } catch (e) { return false; }
  }
  if (acked()) return;

  var ageOk = false, useOk = false, role = '', tried = false;
  var root = document.createElement('div');
  root.id = 'ambrosia-gate';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Before you enter');
  root.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(36,28,25,0.94); display:flex; align-items:flex-start; justify-content:center; padding:24px; overflow-y:auto; font-family:Archivo, sans-serif; -webkit-font-smoothing:antialiased';

  var mark = '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true" style="width:44px; height:44px; margin:0 auto; display:block"><path d="M50 12 L82.9 31 L82.9 69 L50 88 L17.1 69 L17.1 31 Z" stroke="#7A5622" stroke-width="2.6"></path><path d="M50 50 L82.9 31 M50 50 L82.9 69 M50 50 L17.1 69 M50 50 L17.1 31" stroke="#7A5622" stroke-width="2.6"></path><g stroke="#7A5622" stroke-width="3.4" fill="#F0E9DC"><circle cx="50" cy="12" r="4.1"></circle><circle cx="82.9" cy="31" r="4.1"></circle><circle cx="82.9" cy="69" r="4.1"></circle><circle cx="50" cy="88" r="4.1"></circle><circle cx="17.1" cy="69" r="4.1"></circle><circle cx="17.1" cy="31" r="4.1"></circle></g><circle cx="50" cy="50" r="4.8" stroke="#7A5622" stroke-width="3.8" fill="#F0E9DC"></circle></svg>';
  var box = 'display:flex; gap:14px; align-items:flex-start; padding:16px 18px; border:1px solid #D8C9B2; cursor:pointer';
  var cb = 'flex:0 0 auto; width:19px; height:19px; margin:1px 0 0; cursor:pointer';
  var txt = 'font-size:14px; line-height:1.6; color:#241C19';
  var link = 'color:#7A5622; border-bottom:1px solid #C9A227; text-decoration:none';

  root.innerHTML =
    '<div style="margin:auto; background:#F0E9DC; width:100%; max-width:540px; padding:clamp(28px,5vw,54px); text-align:center">' +
      mark +
      '<div style="font-family:Cinzel, serif; font-weight:600; font-size:19px; letter-spacing:0.32em; color:#6B1F28; margin-top:16px; padding-left:0.32em">AMBROSIA</div>' +
      '<h2 style="font-family:\'Instrument Serif\', serif; font-weight:400; font-size:clamp(26px,3.4vw,34px); line-height:1.16; color:#241C19; margin:28px 0 0">Before you enter.</h2>' +
      '<p style="font-size:14.5px; line-height:1.7; color:#3C312C; margin:16px 0 0">Ambrosia supplies research materials to laboratories and qualified purchasers only. Confirm your researcher status and both statements to continue.</p>' +
      '<div style="display:flex; flex-direction:column; gap:12px; margin-top:32px; text-align:left">' +
        '<label for="amb-gate-role" style="font-size:11px; font-weight:600; letter-spacing:0.2em; color:#7A5622">I AM PURCHASING AS A</label>' +
        '<select id="amb-gate-role" style="width:100%; height:52px; padding:0 16px; border:1px solid #D8C9B2; background:#F0E9DC; color:#241C19; font-family:inherit; font-size:14px; border-radius:0; cursor:pointer; margin-bottom:8px">' +
          '<option value="">Select researcher type</option>' +
          '<option value="independent">Independent researcher</option>' +
          '<option value="academic">Academic or university researcher</option>' +
          '<option value="industry">Commercial or industry laboratory</option>' +
          '<option value="cro">Contract research organization</option>' +
          '<option value="none">None of the above</option>' +
        '</select>' +
        '<label style="' + box + '"><input id="amb-gate-age" type="checkbox" style="' + cb + '"><span style="' + txt + '">I am 21 years of age or older.</span></label>' +
        '<label style="' + box + '"><input id="amb-gate-use" type="checkbox" style="' + cb + '"><span style="' + txt + '">I am acquiring these materials for laboratory research only, not for human or animal use, and I agree to the <a href="research-use-policy.html" style="' + link + '">Research Use Policy</a> and <a href="terms-of-sale.html" style="' + link + '">Terms of Sale</a>.</span></label>' +
      '</div>' +
      '<div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin-top:28px">' +
        '<button id="amb-gate-go" type="button" style="display:inline-flex; align-items:center; justify-content:center; height:52px; padding:0 34px; font-size:12px; font-weight:600; letter-spacing:0.18em; border:none; cursor:pointer; background:#D8C9B2; color:#8C8377; transition:background-color 300ms ease, color 300ms ease">CONFIRM &amp; ENTER</button>' +
        '<a href="https://www.google.com" style="display:inline-flex; align-items:center; justify-content:center; height:52px; padding:0 30px; border:1px solid #D8C9B2; color:#241C19; font-size:12px; font-weight:600; letter-spacing:0.18em; text-decoration:none">EXIT</a>' +
      '</div>' +
      '<div id="amb-gate-err" role="alert" style="display:none; font-size:13px; line-height:1.7; color:#6B1F28; margin:18px 0 0">Select your researcher type and confirm both statements to continue.</div>' +
      '<p style="font-size:11.5px; line-height:1.7; color:#6E6055; margin:24px 0 0">For Research Use Only &mdash; Not for Human Use. Not for human or animal consumption, therapeutic, clinical or diagnostic use.</p>' +
    '</div>';

  function paint() {
    var go = root.querySelector('#amb-gate-go');
    var ready = ageOk && useOk && role && role !== 'none';
    go.style.background = ready ? '#6B1F28' : '#D8C9B2';
    go.style.color = ready ? '#F0E9DC' : '#8C8377';
    go.setAttribute('aria-disabled', ready ? 'false' : 'true');
    var err = root.querySelector('#amb-gate-err');
    err.textContent = role === 'none' ? 'Ambrosia supplies materials to researchers only. Entry is not available.' : 'Select your researcher type and confirm both statements to continue.';
    err.style.display = ((tried && !ready) || role === 'none') ? 'block' : 'none';
  }

  function mount() {
    document.body.appendChild(root);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.querySelector('#amb-gate-age').addEventListener('change', function (e) { ageOk = e.target.checked; paint(); });
    root.querySelector('#amb-gate-use').addEventListener('change', function (e) { useOk = e.target.checked; paint(); });
    root.querySelector('#amb-gate-role').addEventListener('change', function (e) { role = e.target.value; paint(); });
    root.querySelector('#amb-gate-go').addEventListener('click', function () {
      if (!(ageOk && useOk && role && role !== 'none')) { tried = true; paint(); return; }
      try { localStorage.setItem(KEY, 'yes'); localStorage.setItem(AT, String(Date.now())); localStorage.setItem(ROLE, role); } catch (e) {}
      root.remove();
      document.body.style.overflow = prevOverflow;
      document.dispatchEvent(new CustomEvent('ambrosia:gate-confirmed'));
    });
    paint();
  }

  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
