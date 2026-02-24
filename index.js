/* ================================================
   RoxyScore — index.js  v0.5
   Firebase Auth entegrasyonu + localStorage fallback
   ================================================ */

/* ── FİREBASE BAŞLAT ─────────────────────────────
   Config.js'deki FIREBASE_CONFIG ile Firebase'i başlat.
   Firebase yüklenemezse localStorage auth devreye girer.
─────────────────────────────────────────────────── */
let fbAuth = null;
try {
  firebase.initializeApp(FIREBASE_CONFIG);
  fbAuth = firebase.auth();
  // Oturum açıksa direkt ana sayfaya
  fbAuth.onAuthStateChanged(user => {
    if (user) {
      AS.setSession(user.email, user.uid);
      goTo('home.html');
    }
  });
} catch(e) {
  console.warn('Firebase başlatılamadı, localStorage auth aktif:', e.message);
  if (AS.getSession()) goTo('home.html');
}

function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }

function showErr(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
  var inp = el.closest('.fg')?.querySelector('input');
  if (inp) inp.classList.toggle('error', !!msg);
}
function clearErr(id) { showErr(id, ''); }

function setLoading(btnId, on) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = on;
  btn.querySelector('.bt')?.classList.toggle('hidden', on);
  btn.querySelector('.bl')?.classList.toggle('hidden', !on);
}

function shake() {
  var c = document.querySelector('.auth-card');
  c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
}

/* Firebase hata kodları → Türkçe mesajlar */
function fbError(code) {
  const map = {
    'auth/user-not-found':         'Bu e-posta ile kayıt bulunamadı',
    'auth/wrong-password':         'Şifre yanlış',
    'auth/email-already-in-use':   'Bu e-posta zaten kayıtlı',
    'auth/weak-password':          'Şifre en az 6 karakter olmalı',
    'auth/invalid-email':          'Geçerli bir e-posta girin',
    'auth/too-many-requests':      'Çok fazla deneme. Lütfen bekleyin',
    'auth/network-request-failed': 'İnternet bağlantısı yok',
    'auth/invalid-credential':     'E-posta veya şifre hatalı',
  };
  return map[code] || 'Bir hata oluştu. Tekrar deneyin';
}

// ── TAB GEÇİŞİ ───────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  var target = document.getElementById('form-' + name);
  if (target) target.classList.add('active');
  ['login-email-err','login-pass-err','reg-email-err','reg-pass-err','reg-confirm-err','forgot-err'].forEach(clearErr);
}
document.querySelectorAll('[data-tab]').forEach(el => {
  el.addEventListener('click', () => switchTab(el.dataset.tab));
});

// ── ŞİFRE GÖSTER/GİZLE ───────────────────────────
document.querySelectorAll('.eye').forEach(btn => {
  btn.addEventListener('click', () => {
    var inp = document.getElementById(btn.dataset.t);
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  });
});

// ── ŞİFRE GÜCÜ ───────────────────────────────────
document.getElementById('reg-password')?.addEventListener('input', function() {
  var v = this.value, score = 0;
  if (v.length >= 6)  score++;
  if (v.length >= 10) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  var lvls = [
    { pct:'0%',   bg:'#2c3550', lbl:'' },
    { pct:'25%',  bg:'#ff3d57', lbl:'Çok Zayıf' },
    { pct:'50%',  bg:'#ff9800', lbl:'Zayıf' },
    { pct:'75%',  bg:'#ffd600', lbl:'Orta' },
    { pct:'90%',  bg:'#00bcd4', lbl:'İyi' },
    { pct:'100%', bg:'#00e676', lbl:'Güçlü' },
  ];
  var lvl = v.length === 0 ? lvls[0] : lvls[Math.min(score, 5)];
  document.getElementById('sf').style.width      = lvl.pct;
  document.getElementById('sf').style.background = lvl.bg;
  var sl = document.getElementById('sl');
  sl.textContent = lvl.lbl;
  sl.style.color = lvl.bg;
});

// ── GİRİŞ ─────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  var email = document.getElementById('login-email').value.trim();
  var pass  = document.getElementById('login-password').value;
  var ok = true;
  clearErr('login-email-err'); clearErr('login-pass-err');
  if (!email)          { showErr('login-email-err', 'E-posta adresi gerekli'); ok = false; }
  else if (!isEmail(email)) { showErr('login-email-err', 'Geçerli bir e-posta girin'); ok = false; }
  if (!pass)           { showErr('login-pass-err', 'Şifre gerekli'); ok = false; }
  if (!ok) { shake(); return; }

  setLoading('login-btn', true);

  if (fbAuth) {
    // Firebase Auth
    try {
      const uc = await fbAuth.signInWithEmailAndPassword(email, pass);
      AS.setSession(uc.user.email, uc.user.uid);
      goTo('home.html');
    } catch(err) {
      showErr('login-email-err', fbError(err.code));
      shake();
      setLoading('login-btn', false);
    }
  } else {
    // localStorage fallback
    await sleep(600);
    var users = AS.getUsers();
    var user  = users[email.toLowerCase()];
    if (!user) {
      showErr('login-email-err', 'Bu e-posta ile kayıt bulunamadı');
      shake();
    } else if (user.password !== pass) {
      showErr('login-pass-err', 'Şifre yanlış');
      shake();
    } else {
      AS.setSession(email.toLowerCase(), null);
      goTo('home.html');
      return;
    }
    setLoading('login-btn', false);
  }
});

// ── KAYIT ──────────────────────────────────────────
document.getElementById('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  var email   = document.getElementById('reg-email').value.trim();
  var pass    = document.getElementById('reg-password').value;
  var confirm = document.getElementById('reg-confirm').value;
  var ok = true;
  clearErr('reg-email-err'); clearErr('reg-pass-err'); clearErr('reg-confirm-err');
  if (!email)             { showErr('reg-email-err', 'E-posta adresi gerekli'); ok = false; }
  else if (!isEmail(email)) { showErr('reg-email-err', 'Geçerli bir e-posta girin'); ok = false; }
  if (!pass)              { showErr('reg-pass-err', 'Şifre gerekli'); ok = false; }
  else if (pass.length<6) { showErr('reg-pass-err', 'En az 6 karakter olmalı'); ok = false; }
  if (!confirm)           { showErr('reg-confirm-err', 'Şifre tekrarı gerekli'); ok = false; }
  else if (pass !== confirm) { showErr('reg-confirm-err', 'Şifreler eşleşmiyor'); ok = false; }
  if (!ok) { shake(); return; }

  setLoading('reg-btn', true);

  if (fbAuth) {
    // Firebase Auth
    try {
      const uc = await fbAuth.createUserWithEmailAndPassword(email, pass);
      AS.setSession(uc.user.email, uc.user.uid);
      goTo('home.html');
    } catch(err) {
      if (err.code === 'auth/email-already-in-use') {
        showErr('reg-email-err', fbError(err.code));
      } else {
        showErr('reg-pass-err', fbError(err.code));
      }
      shake();
      setLoading('reg-btn', false);
    }
  } else {
    // localStorage fallback
    await sleep(600);
    var users = AS.getUsers();
    if (users[email.toLowerCase()]) {
      showErr('reg-email-err', 'Bu e-posta zaten kayıtlı');
      shake();
      setLoading('reg-btn', false);
      return;
    }
    users[email.toLowerCase()] = { email: email.toLowerCase(), password: pass, createdAt: Date.now() };
    AS.saveUsers(users);
    setLoading('reg-btn', false);
    showModal('Hesap Oluşturuldu', 'Giriş yapabilirsin.', () => {
      switchTab('login');
      document.getElementById('login-email').value = email;
    });
  }
});

// ── ŞİFRE SIFIRLA ─────────────────────────────────
document.getElementById('form-forgot').addEventListener('submit', async e => {
  e.preventDefault();
  var email = document.getElementById('forgot-email').value.trim();
  clearErr('forgot-err');
  if (!email)          { showErr('forgot-err', 'E-posta adresi gerekli'); shake(); return; }
  if (!isEmail(email)) { showErr('forgot-err', 'Geçerli bir e-posta girin'); shake(); return; }
  setLoading('forgot-btn', true);
  if (fbAuth) {
    try {
      await fbAuth.sendPasswordResetEmail(email);
      setLoading('forgot-btn', false);
      showModal('E-posta Gönderildi', email + ' adresine sıfırlama bağlantısı gönderildi.', () => switchTab('login'));
    } catch(err) {
      showErr('forgot-err', fbError(err.code));
      shake();
      setLoading('forgot-btn', false);
    }
  } else {
    await sleep(900);
    setLoading('forgot-btn', false);
    showModal('E-posta Gönderildi', email + ' adresine sıfırlama bağlantısı gönderildi.', () => switchTab('login'));
  }
});

// ── MODAL ─────────────────────────────────────────
function showModal(title, desc, onOk) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-desc').textContent  = desc;
  document.getElementById('modal').classList.remove('hidden');
  var btn = document.getElementById('modal-ok');
  var handler = () => {
    document.getElementById('modal').classList.add('hidden');
    btn.removeEventListener('click', handler);
    if (onOk) onOk();
  };
  btn.addEventListener('click', handler);
}
