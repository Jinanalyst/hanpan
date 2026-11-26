// Player-made chat servers. The database decides who may read, write and invite; this page only shows it.
import { client, configured, currentUser, shortWallet, signInGuest } from './auth.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (text, label, fn, cls) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.onclick = fn; return b; };
const status = t => { $('status').textContent = t; };
const load = k => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const framed = window.top !== window.self;

const COLORS = ['Red', 'Blue', 'Sand', 'Green', 'Violet', 'Teal'];
const PAGE = 50, MAX_SHOWN = 500;

let guest = false, COPY = 'Copy address';
let sb = null, home = { wallet: '', servers: [], invites: [] }, cur = null, people = { members: [], invites: [] };
let limit = PAGE, live = false, channel = null, shown = {}, seen = {};
try { seen = JSON.parse(load('hanpan-seen')) || {}; } catch { /* start fresh */ }

const WHY = {
  not_signed_in: 'Your login has expired. Log in again.', no_wallet: 'Log in with a Solana wallet to use servers.',
  bad_name: 'The name needs 2 to 32 characters.', too_many_owned: 'You can own up to 5 servers.', too_many_joined: 'You can be in up to 30 servers.',
  bad_wallet: 'That is not a Solana wallet address or a friend code (like K7QM-2XPA).', already_member: 'This person is already here.', already_invited: 'Already invited. They have not answered yet.',
  declined: 'This person said no recently. You can ask again after a week.', server_full: 'A server holds up to 50 people, counting invitations.',
  no_invite: 'This invitation is gone.', not_member: 'You are no longer in this server.', not_owner: 'Only the owner can do that.',
  too_fast: 'Too fast. Wait a few seconds.', bad_message: 'A message needs 1 to 500 characters.', not_allowed: 'That message cannot be deleted.',
};
function explain(e) {
  const m = String(e?.message || e || '');
  if (WHY[m]) return WHY[m];
  if (e?.code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(m)) return 'Guest servers are not turned on yet. Log in with a wallet for now.';
  if (e?.code === 'PGRST202' || e?.code === 'PGRST205') return 'Servers are not set up yet.';
  if (e?.code === 'PGRST301' || e?.code === 'PGRST303' || /jwt/i.test(m)) return WHY.not_signed_in;
  return 'The chat server did not answer. Try again in a moment.';
}
async function rpc(name, args) {
  const { data, error } = await sb.rpc('chat_' + name, args);
  if (error) throw error;
  return data;
}
// Runs an action from a button or form and shows why it failed.
async function act(fn, say = status) {
  try { if (say === status) failed = false; say(''); await fn(); return true; } catch (e) {
    console.warn('[servers]', e);
    say(explain(e));
    if (['not_member', 'not_owner', 'no_invite'].includes(e?.message)) refresh();
    return false;
  }
}

/* ---- wallet addresses ---- */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// A guest's friend code, as the database makes it: XXXX-XXXX without I, O, 0 or 1.
const isCode = s => /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i.test(s);
function isWallet(s) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const zeros = s.match(/^1*/)[0].length, bytes = n === 0n ? 0 : Math.ceil(n.toString(16).length / 2);
  return zeros + bytes === 32;
}
const badge = s => el('span', 'badge c' + (s.color | 0), [...s.name][0].toUpperCase());
const personName = m => m.nick || shortWallet(m.wallet);

/* ---- lists ---- */
// Redraws only what changed, so focus and scroll stay where they are.
function changed(key, value) { const j = JSON.stringify(value); if (shown[key] === j) return false; shown[key] = j; return true; }

function paintHome() {
  const here = home.servers.find(s => s.id === cur);
  if (changed('home', [home, cur, seen])) {
    $('myWallet').textContent = home.wallet;
    $('serverList').replaceChildren(...home.servers.map(s => {
      const li = el('li'), b = btn('', null, () => open(s.id), 'srv');
      b.append(badge(s), el('span', 'nm', s.name));
      if (s.id === cur) b.setAttribute('aria-current', 'true');
      else if (s.last && s.last > (seen[s.id] || 0)) { b.append(el('i', 'dot')); b.append(el('span', 'sr', 'new messages')); }
      li.append(b);
      return li;
    }));
    $('noServers').hidden = home.servers.length > 0;
    $('invBox').hidden = !home.invites.length;
    $('invList').replaceChildren(...home.invites.map(i => {
      const li = el('li', 'inv'), row = el('div', 'row'), top = el('div', 'srv'), text = el('span', 'nm', i.name);
      const from = el('small', '', 'From ' + (i.nick ? i.nick + ' · ' : '') + shortWallet(i.from)); from.title = i.from;
      top.append(badge(i), text);
      row.append(btn('Join', 'Join ' + i.name, () => act(async () => { await rpc('accept', { p_server: i.id, p_nick: load('hanpan-name') || '' }); await getHome(); open(i.id); }), 'primary'),
        btn('Decline', 'Decline ' + i.name, () => act(async () => { await rpc('decline', { p_server: i.id }); await getHome(); })));
      li.append(top, from, row);
      return li;
    }));
  }
  $('room').hidden = !here; $('pick').hidden = !!here; $('app').classList.toggle('inRoom', !!here);
  if (!here) { $('people').hidden = true; return; }
  $('people').hidden = false;
  $('roomName').textContent = here.name; $('roomAbout').textContent = here.about;
  $('editBtn').hidden = !here.mine; $('leaveBtn').hidden = here.mine; $('addForm').hidden = !here.mine;
  document.title = here.name + ' · HANPAN 한판';
}

function paintPeople() {
  const mine = home.servers.find(s => s.id === cur)?.mine;
  if (!changed('people', [cur, people, mine])) return;
  $('count').textContent = people.members.length;
  $('memberList').replaceChildren(...people.members.map(m => {
    const li = el('li'), who = el('div', 'who'), w = el('small', '', shortWallet(m.wallet) + (m.owner ? ' · owner' : '') + (m.me ? ' · you' : ''));
    who.append(el('b', '', personName(m)), w); w.title = m.wallet;
    li.append(who);
    if (mine && !m.me) li.append(btn('Remove', 'Remove ' + personName(m), async () => {
      const sid = cur;
      if (await ask(`Remove ${personName(m)} (${shortWallet(m.wallet)}) from this server?`, 'Remove')) act(async () => { await rpc('remove', { p_server: sid, p_user: m.user }); await getPeople(); });
    }));
    return li;
  }));
  $('sentBox').hidden = !people.invites.length;
  $('sentList').replaceChildren(...people.invites.map(w => {
    const li = el('li'), who = el('div', 'who'), b = el('b', '', shortWallet(w)), sid = cur;
    b.title = w; who.append(b);
    li.append(who, btn('Cancel', 'Cancel invitation for ' + w, () => act(async () => { await rpc('uninvite', { p_server: sid, p_wallet: w }); await getPeople(); })));
    return li;
  }));
  if (document.activeElement !== $('nickIn')) $('nickIn').value = people.members.find(m => m.me)?.nick || '';
}

const when = iso => {
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString([], today ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
function paintMessages(list, sid) {
  const mine = home.servers.find(s => s.id === sid)?.mine, by = new Map(people.members.map(m => [m.user, m]));
  const log = $('log'), atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60, first = shown.sid !== sid;
  if (!changed('msgs', [sid, list, mine, people.members])) return;
  shown.sid = sid;
  const fromEnd = log.scrollHeight - log.scrollTop;
  let prev = null;
  $('msgs').replaceChildren(...list.map(m => {
    const p = by.get(m.user_id), li = el('li', p?.me ? 'me' : ''), name = p ? personName(p) : shortWallet(m.wallet);
    if (!prev || prev.user_id !== m.user_id || new Date(m.created_at) - new Date(prev.created_at) > 300000) {
      const h = el('div', 'by'), w = el('small', '', (p?.nick ? shortWallet(m.wallet) + ' · ' : '') + when(m.created_at));
      w.title = m.wallet; h.append(el('b', '', name), w); li.append(h);
    }
    prev = m;
    const line = el('div', 'line');
    line.append(fightCard(m.body) || el('span', '', m.body));
    if (mine || p?.me) line.append(btn('Delete', `Delete message from ${name}: ${m.body.slice(0, 60)}`, () => act(async () => { await rpc('unpost', { p_message: m.id }); await getMessages(); }), 'del'));
    li.append(line);
    return li;
  }));
  $('empty').hidden = list.length > 0;
  $('olderBtn').hidden = list.length < limit || limit >= MAX_SHOWN;
  log.scrollTop = first || atEnd ? log.scrollHeight : log.scrollHeight - fromEnd;
}

/* ---- loading ---- */
async function getHome() {
  home = await rpc('home');
  if (cur && !home.servers.some(s => s.id === cur)) close('You are no longer in that server.');
  paintHome();
}
async function getPeople() {
  const sid = cur;
  if (!sid) return;
  const p = await rpc('people', { p_server: sid });
  if (sid === cur) { people = p; paintPeople(); }
}
let msgRun = 0;
async function getMessages() {
  const sid = cur, run = ++msgRun;
  if (!sid) return;
  const { data, error } = await sb.from('chat_messages').select('id,user_id,wallet,body,created_at').eq('server_id', sid).order('id', { ascending: false }).limit(limit);
  if (error) throw error;
  if (sid !== cur || run !== msgRun) return;   // a newer request is on its way
  paintMessages(data.reverse(), sid);
  const last = data.at(-1)?.id || 0;
  if (last > (seen[sid] || 0)) { seen[sid] = last; save('hanpan-seen', JSON.stringify(seen)); paintHome(); }
}
// A connection problem found while checking in the background; cleared by the next check that works.
let failed = false;
function lost(e) { console.warn('[servers]', e); failed = true; status(explain(e)); }
function back() { if (failed) { failed = false; status(''); } }
const refresh = () => Promise.all([getHome(), getPeople(), getMessages()]).then(back, e => { if (e?.message !== 'not_member') lost(e); });

function close(why) {
  cur = null; people = { members: [], invites: [] }; msgRun++;
  if (channel) { sb.removeChannel(channel); channel = null; }
  live = false;
  $('app').classList.remove('showPeople'); $('peopleBtn').setAttribute('aria-expanded', 'false');
  document.title = 'Servers · HANPAN 한판';
  if (why) status(why);
  paintHome();
}
async function open(id) {
  if (id === cur) return;
  close();
  status('');
  cur = id; limit = PAGE; shown.sid = null;
  $('msgs').replaceChildren(); $('memberList').replaceChildren(); $('sentBox').hidden = true; $('empty').hidden = true; $('olderBtn').hidden = true;
  $('msgIn').value = ''; $('walletIn').value = ''; $('addNote').textContent = HINT;
  delete shown.msgs; delete shown.people;
  paintHome();
  // New messages ring at once; the timer below also checks, in case the live connection is down.
  const mine = channel = sb.channel('chat-' + id);
  mine.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'server_id=eq.' + id }, () => getMessages().catch(() => {}))
    .subscribe(s => { if (mine === channel) live = s === 'SUBSCRIBED'; });
  await act(async () => { await getPeople(); await getMessages(); });
  if (cur === id && matchMedia('(min-width:901px)').matches) $('msgIn').focus();
}

let ticks = 0, ticking = false;
async function tick() {
  if (document.hidden || ticking || !sb) return;
  ticking = true; ticks++;
  try {
    if (cur && (!live || ticks % 3 === 0)) await getMessages();
    if (ticks % 3 === 0) { await getHome(); await getPeople(); }
    back();
  } catch (e) {
    if (e?.message === 'not_member') await getHome().catch(() => {}); else lost(e);
  }
  ticking = false;
}

/* ---- forms ---- */
const HINT = $('addNote').textContent;
$('addForm').onsubmit = e => {
  e.preventDefault();
  const raw = $('walletIn').value.trim(), w = isCode(raw) ? raw.toUpperCase() : raw, note = t => { $('addNote').textContent = t || HINT; }, sid = cur;
  if (!isWallet(w) && !isCode(w)) return note(WHY.bad_wallet);
  act(async () => {
    await rpc('invite', { p_server: sid, p_wallet: w });
    if (sid !== cur) return;
    $('walletIn').value = '';
    await getPeople();
  }, note).then(ok => { if (ok && sid === cur) note(`Invited ${shortWallet(w)}. They will see it on this page when they log in.`); });
};
let sending = false;
$('sendForm').onsubmit = async e => {
  e.preventDefault();
  const text = $('msgIn').value.trim(), sid = cur;
  if (!text || sending) return;
  sending = true;
  await act(async () => {
    await rpc('post', { p_server: sid, p_body: text });
    if (sid !== cur) return;
    if ($('msgIn').value.trim() === text) $('msgIn').value = '';
    await getMessages();
    $('log').scrollTop = $('log').scrollHeight;
  });
  sending = false;
};
$('msgIn').onkeydown = e => { if (e.key === 'Enter' && e.isComposing) e.preventDefault(); };   // Enter that only finishes a Hangul syllable
$('nickForm').onsubmit = e => {
  e.preventDefault();
  const sid = cur;
  act(async () => { await rpc('rename_me', { p_server: sid, p_nick: $('nickIn').value }); $('nickIn').blur(); await getPeople(); await getMessages(); });
};
$('olderBtn').onclick = () => { limit = Math.min(MAX_SHOWN, limit + PAGE); act(getMessages); };
$('backBtn').onclick = () => close('');
$('peopleBtn').onclick = () => $('peopleBtn').setAttribute('aria-expanded', String($('app').classList.toggle('showPeople')));
$('copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(home.wallet); $('copyBtn').textContent = 'Copied'; } catch { $('copyBtn').textContent = 'Select and copy it above'; }
  setTimeout(() => { $('copyBtn').textContent = COPY; }, 2000);
};
$('leaveBtn').onclick = async () => {
  const s = home.servers.find(x => x.id === cur);
  if (s && await ask(`Leave ${s.name}? You need a new invitation to come back.`, 'Leave')) act(async () => { await rpc('leave', { p_server: s.id }); close(''); await getHome(); });
};

let editing = null;
COLORS.forEach((name, i) => {
  const l = el('label', 'c' + i), r = el('input');
  Object.assign(r, { type: 'radio', name: 'color', value: i }); r.setAttribute('aria-label', name);
  l.append(r); $('colors').append(l);
});
function edit(s) {
  editing = s;
  $('editTitle').textContent = s ? 'Edit server' : 'New server'; $('editOk').textContent = s ? 'Save' : 'Create';
  $('nameIn2').value = s?.name || ''; $('aboutIn').value = s?.about || ''; $('editErr').textContent = ''; $('delBtn').hidden = !s;
  $('colors').querySelectorAll('input')[s?.color ?? Math.floor(Math.random() * COLORS.length)].checked = true;
  $('editDlg').showModal();
}
$('newBtn').onclick = () => edit(null);
$('editBtn').onclick = () => { const s = home.servers.find(x => x.id === cur); if (s) edit(s); };
$('editNo').onclick = () => $('editDlg').close();
$('editForm').onsubmit = async e => {
  e.preventDefault();
  const s = editing, args = { p_name: $('nameIn2').value, p_about: $('aboutIn').value, p_color: +$('colors').querySelector(':checked').value };
  if ($('editOk').disabled) return;
  $('editOk').disabled = true;
  let made = null;
  const ok = await act(async () => {
    if (s) await rpc('edit', { p_server: s.id, ...args });
    else made = await rpc('create', { ...args, p_nick: load('hanpan-name') || '' });
  }, t => { $('editErr').textContent = t; });
  $('editOk').disabled = false;
  if (!ok) return;
  $('editDlg').close();
  await act(getHome);
  if (made) open(made);
};
$('delBtn').onclick = async () => {
  const s = editing;
  $('editDlg').close();
  if (s && await ask(`Delete ${s.name} with all of its messages, for everyone? This cannot be undone.`, 'Delete')) act(async () => { await rpc('delete', { p_server: s.id }); close(''); await getHome(); });
};

/* ---- private fights ---- */
// A fight is an ordinary chat message, so only members of this server can read the link.
// The card always opens this site's own game page, whatever address the message text holds.
const FIGHT_RE = /^⚔ ([125]) vs \1 fight on (.{1,40}) · join: \S*\?fight=([a-z0-9]{10})$/u;
function fightCard(body) {
  const f = FIGHT_RE.exec(body);
  if (!f) return null;
  const card = el('div', 'fightCard'), text = el('div'), go = el('a', 'btn primary', 'Join fight');
  text.append(el('b', '', `⚔ ${f[1]} vs ${f[1]} fight`), el('br'), el('small', '', f[2] + ' · private to this server'));
  go.href = './?fight=' + f[3];
  go.setAttribute('aria-label', `Join the ${f[1]} vs ${f[1]} fight on ${f[2]}`);
  card.append(text, go);
  return card;
}
let lands = null;
async function fightLands() {
  if (lands) return lands;
  const r = await fetch('fight/lands', { cache: 'no-store' });
  if (!r.ok) throw new Error('no_game');
  return (lands = (await r.json()).lands);
}
$('fightBtn').onclick = async () => {
  $('fightErr').textContent = '';
  const sel = $('fightLand');
  try {
    const list = await fightLands(), was = sel.value || load('hanpan-fight-land');
    sel.replaceChildren(...[['Cities', true], ['Battlegrounds', false]].map(([label, city]) => {
      const g = el('optgroup'); g.label = label;
      g.append(...list.filter(l => l.city === city).map(l => { const o = el('option', '', l.name); o.value = l.id; return o; }));
      return g;
    }));
    if (list.some(l => l.id === was)) sel.value = was;
  } catch { status('Fights need the game server. Open this page from hanpan.team.'); return; }
  $('fightDlg').showModal();
};
$('fightNo').onclick = () => $('fightDlg').close();
$('fightForm').onsubmit = async e => {
  e.preventDefault();
  const sid = cur, n = +$('fightForm').querySelector('[name=size]:checked').value, map = $('fightLand').value;
  if ($('fightOk').disabled || !sid) return;
  $('fightOk').disabled = true;
  const say = t => { $('fightErr').textContent = t; };
  try {
    const r = await fetch('fight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n, map }) });
    const f = await r.json().catch(() => ({}));
    if (!r.ok || !f.code) { say(r.status === 429 ? 'Too many fights made. Wait a minute.' : 'The game server could not make the fight. Try again.'); return; }
    save('hanpan-fight-land', map);
    const ok = await act(async () => {
      await rpc('post', { p_server: sid, p_body: `⚔ ${n} vs ${n} fight on ${f.land} · join: ${location.origin}/?fight=${f.code}` });
      if (sid === cur) { await getMessages(); $('log').scrollTop = $('log').scrollHeight; }
    }, say);
    if (ok) $('fightDlg').close();
  } catch { say('The game server did not answer. Try again in a moment.'); } finally { $('fightOk').disabled = false; }
};

function ask(text, yes) {
  $('askText').textContent = text; $('askYes').textContent = yes;
  const d = $('askDlg');
  return new Promise(done => {
    let ok = false;
    $('askYes').onclick = () => { ok = true; d.close(); };
    $('askNo').onclick = () => d.close();
    d.onclose = () => done(ok);
    d.showModal();
    $('askNo').focus();
  });
}

/* ---- start ---- */
$('guestBtn').onclick = async () => {
  if ($('guestBtn').disabled) return;
  $('guestBtn').disabled = true;
  try { await signInGuest(); $('gate').hidden = true; await start(); }
  catch (e) { console.warn('[servers]', e); status(explain(e)); }
  finally { $('guestBtn').disabled = false; }
};
async function start() {
  if (framed) { status('Servers do not work inside another page. Open hanpan.team directly.'); return; }
  if (!configured) { status('Servers are not set up yet.'); return; }
  let user = null;
  try { user = await currentUser({ guest: true }); } catch (e) { status(explain(e)); }
  guest = !!user?.is_anonymous;
  const a = el('a', '', user && !guest ? 'Account' : 'Log in with wallet');
  a.href = user && !guest ? 'login.html' : 'login.html?next=servers';
  $('who').replaceChildren(a);
  if (!user) { $('gate').hidden = false; return; }
  try {
    sb = await client();
    if (guest) await rpc('guest');   // makes this guest's friend code the first time
    await getHome();
    if (guest) {
      $('who').prepend(el('span', 'small', 'Guest · ' + home.wallet + ' '));
      $('myLbl').textContent = 'Your friend code'; $('copyBtn').textContent = COPY = 'Copy code';
      $('guestNote').hidden = false;
    } else { a.textContent = shortWallet(home.wallet); a.title = home.wallet; }
    $('app').hidden = false;
    setInterval(tick, 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  } catch (e) {
    console.warn('[servers]', e);
    status(explain(e));
    if (e?.message === 'no_wallet' || explain(e) === WHY.not_signed_in) $('gate').hidden = false;
  }
}
start();
