/* Vanity affiliate paths for the offer screen (/Nicole and the like).
   Reads config/affiliates.json. A matching path records an AffiliateWP visit
   the same way a ?ref= link does, then sets affwp_ref and affwp_ref_visit_id.
   The offer page reads window.AmbrosiaVanity.ready for the greeting. */
(function () {
  if (window.__ambVanityBoot) return;
  window.__ambVanityBoot = true;

  var ready = new Promise(function (resolve) {
    window.__ambVanityResolve = resolve;
  });
  window.AmbrosiaVanity = { name: '', ready: ready };

  function paintGreeting(name) {
    var el = document.querySelector('[data-vanity-greeting]');
    if (!el) return;
    if (!name) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = name + ' shared this research-use offer.';
  }

  function finish(name) {
    window.AmbrosiaVanity.name = name || '';
    paintGreeting(window.AmbrosiaVanity.name);
    window.__ambVanityResolve(window.AmbrosiaVanity.name);
  }

  function slugFromPath(pathname) {
    var parts = String(pathname || '').split('/').filter(Boolean);
    if (parts.length !== 1) return '';
    var slug = parts[0];
    try { slug = decodeURIComponent(slug); } catch (e) {}
    return slug.replace(/\/+$/, '').trim().toLowerCase();
  }

  function findAffiliate(data, slug) {
    var list = data && data.affiliates;
    if (!slug || !list || !list.length) return null;
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      if (String(row.slug || '').trim().toLowerCase() === slug) return row;
    }
    return null;
  }

  function hasCookie(name) {
    return new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=').test(document.cookie);
  }

  function shopHost(hostname) {
    return /(^|\.)ambrosiastandard\.com$/i.test(String(hostname || ''));
  }

  function writeCookie(name, value, days, domain) {
    var maxAge = (Number(days) || 30) * 86400;
    var parts = [
      name + '=' + encodeURIComponent(value),
      'Path=/',
      'Max-Age=' + maxAge,
      'SameSite=Lax'
    ];
    if (domain) parts.push('Domain=' + domain);
    if (location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  }

  function validVisit(text) {
    var token = String(text || '').trim();
    if (/^\d+\.[a-f0-9]+$/i.test(token)) return token;
    if (/^\d+$/.test(token) && token !== '0') return token;
    return '';
  }

  function postAjax(fields) {
    var body = new URLSearchParams();
    Object.keys(fields).forEach(function (key) { body.set(key, fields[key] == null ? '' : String(fields[key])); });
    return fetch('/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (res) { return res.text(); });
  }

  function resolveId(id) {
    var raw = String(id || '').trim();
    if (/^\d+$/.test(raw) && raw !== '0') return Promise.resolve(raw);
    if (!raw) return Promise.resolve('');
    return postAjax({ action: 'affwp_get_affiliate_id', affiliate: raw }).then(function (text) {
      try {
        var data = JSON.parse(text);
        var payload = data && data.data;
        var resolved = payload && String(payload.affiliate_id || '');
        if (payload && String(payload.success) === '1' && /^\d+$/.test(resolved) && resolved !== '0') return resolved;
      } catch (e) {}
      return '';
    });
  }

  function track(tracking, affiliate) {
    var refName = (tracking && tracking.refCookie) || 'affwp_ref';
    var visitName = (tracking && tracking.visitCookie) || 'affwp_ref_visit_id';
    var days = Number(tracking && tracking.cookieDays) || 30;
    var domain = shopHost(location.hostname) ? ((tracking && tracking.shopCookieDomain) || '.ambrosiastandard.com') : '';
    /* AffiliateWP is set to credit the first referrer (referral_credit_last = 0). */
    if (hasCookie(refName)) return Promise.resolve();
    return resolveId(affiliate.id).then(function (affiliateId) {
      if (!affiliateId) {
        console.error('[affiliate-vanity] no AffiliateWP id for slug ' + affiliate.slug);
        return;
      }
      return postAjax({
        action: 'affwp_track_visit',
        affiliate: affiliateId,
        campaign: '',
        url: location.href,
        referrer: document.referrer || ''
      }).then(function (text) {
        var visit = validVisit(text);
        if (!visit) {
          console.error('[affiliate-vanity] visit was not recorded:', String(text || '').trim().slice(0, 80));
          return;
        }
        writeCookie(refName, affiliateId, days, domain);
        writeCookie(visitName, visit, days, domain);
      });
    }).catch(function (err) {
      console.error('[affiliate-vanity] click tracking failed:', err && err.message);
    });
  }

  var slug = slugFromPath(location.pathname);
  if (!slug || slug === 'offer' || slug === 'index.html') {
    finish('');
    return;
  }

  fetch('/config/affiliates.json', { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      var affiliate = findAffiliate(data, slug);
      if (!affiliate || !affiliate.name) {
        finish('');
        return;
      }
      finish(String(affiliate.name).trim());
      return track(data && data.tracking, affiliate);
    })
    .catch(function (err) {
      console.error('[affiliate-vanity] config read failed:', err && err.message);
      finish('');
    });
})();
