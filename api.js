/* ================================================
   RoxyScore — api.js  v0.5
   API-Football v3 servis katmanı
   Base URL: https://v3.football.api-sports.io
   ================================================ */

const API = (() => {
  const cache = {};
  const CACHE_LIVE = 60000;      // 60sn canlı
  const CACHE_DONE = 300000;     // 5dk biten

  async function request(endpoint, params) {
    const url = new URL(API_BASE_URL + endpoint);
    Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const key = url.toString();

    if (cache[key] && Date.now() - cache[key].ts < cache[key].ttl) {
      return cache[key].data;
    }

    try {
      const resp = await fetch(url.toString(), {
        method: 'GET',
        headers: API_HEADERS,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.errors && Object.keys(json.errors).length > 0) {
        console.warn('API hatası:', json.errors);
        return null;
      }
      const data = json.response || [];
      cache[key] = { data, ts: Date.now(), ttl: CACHE_LIVE };
      return data;
    } catch (e) {
      console.warn('API isteği başarısız:', e.message);
      return null;
    }
  }

  function currentSeason() {
    const now = new Date();
    return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  }

  /* ── BUGÜNÜN MAÇLARI ─────────────────────────── */
  async function getTodayFixtures() {
    const today = new Date().toISOString().split('T')[0];
    const promises = LEAGUE_CONFIG.map(lc =>
      request('/fixtures', {
        league:   lc.id,
        season:   currentSeason(),
        date:     today,
        timezone: 'Europe/Istanbul',
      })
    );
    const results = await Promise.allSettled(promises);
    const fixtures = [];
    results.forEach(r => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        fixtures.push(...r.value);
      }
    });
    return fixtures;
  }

  /* ── TAKIM FİKSTÜRÜ ──────────────────────────── */
  async function getTeamFixtures(teamId, season) {
    season = season || currentSeason();
    return await request('/fixtures', {
      team:     teamId,
      season:   season,
      timezone: 'Europe/Istanbul',
    });
  }

  /* ── TEK MAÇ ─────────────────────────────────── */
  async function getFixtureById(fixtureId) {
    const data = await request('/fixtures', { id: fixtureId });
    return data && data.length ? data[0] : null;
  }

  /* ── MAÇ İSTATİSTİKLERİ ──────────────────────── */
  async function getFixtureStats(fixtureId) {
    const data = await request('/fixtures/statistics', { fixture: fixtureId });
    if (!data || !data.length) return [];
    return mapStats(data);
  }

  /* ── KADRO ───────────────────────────────────── */
  async function getFixtureLineups(fixtureId) {
    const data = await request('/fixtures/lineups', { fixture: fixtureId });
    if (!data || !data.length) return null;
    return mapLineup(data);
  }

  /* ── OLAYLAR ─────────────────────────────────── */
  async function getFixtureEvents(fixtureId, homeTeamId) {
    const data = await request('/fixtures/events', { fixture: fixtureId });
    if (!data || !data.length) return [];
    return mapEvents(data, homeTeamId);
  }

  /* ── H2H ─────────────────────────────────────── */
  async function getH2H(teamA, teamB) {
    const data = await request('/fixtures/headtohead', {
      h2h:  `${teamA}-${teamB}`,
      last: 10,
    });
    if (!data) return { wins: { home: 0, draw: 0, away: 0 }, matches: [] };
    return mapH2H(data, String(teamA), String(teamB));
  }

  /* ── PUAN TABLOSU ────────────────────────────── */
  async function getStandings(leagueId) {
    return await request('/standings', {
      league: leagueId,
      season: currentSeason(),
    });
  }

  /* ── RENK YARDIMCILARI ───────────────────────── */
  function getTeamColor(teamId) {
    const tc = TEAM_COLORS[parseInt(teamId)];
    if (tc) return tc.color;
    const tp = typeof TEAM_PROFILES !== 'undefined' ? TEAM_PROFILES[String(teamId)] : null;
    return tp ? tp.color : '#1e2740';
  }
  function getTeamColor2(teamId) {
    const tc = TEAM_COLORS[parseInt(teamId)];
    if (tc) return tc.color2;
    const tp = typeof TEAM_PROFILES !== 'undefined' ? TEAM_PROFILES[String(teamId)] : null;
    return tp ? (tp.color2 || 'rgba(255,255,255,0.15)') : 'rgba(255,255,255,0.15)';
  }
  function getTeamShort(teamId, name) {
    const tc = TEAM_COLORS[parseInt(teamId)];
    if (tc) return tc.short;
    const tp = typeof TEAM_PROFILES !== 'undefined' ? TEAM_PROFILES[String(teamId)] : null;
    if (tp) return tp.short;
    return name.replace(/\s+/g, '').substring(0, 3).toUpperCase();
  }

  /* ── MAPPERS ─────────────────────────────────── */
  function mapEvents(apiEvents, homeTeamId) {
    return apiEvents.map(e => ({
      min:    e.time.elapsed,
      type:   e.type === 'Goal' ? 'goal' : e.type === 'Card' ? (e.detail === 'Red Card' ? 'red' : 'yellow') : e.type === 'subst' ? 'sub' : e.type.toLowerCase(),
      side:   String(e.team.id) === String(homeTeamId) ? 'home' : 'away',
      player: e.player?.name || '?',
      assist: e.assist?.name || '',
      detail: e.detail || '',
    }));
  }

  function mapStats(apiStats) {
    if (!apiStats || apiStats.length < 2) return [];
    const home = apiStats[0].statistics || [];
    const away = apiStats[1].statistics || [];
    const LABELS = {
      'Ball Possession':  { label: 'Topa Sahip Olma', type: 'possession' },
      'Total Shots':      { label: 'Şut' },
      'Shots on Goal':    { label: 'İsabetli Şut' },
      'Shots off Goal':   { label: 'İsabetsiz Şut' },
      'Corner Kicks':     { label: 'Korner' },
      'Fouls':            { label: 'Faul' },
      'Offsides':         { label: 'Ofsayt' },
      'Yellow Cards':     { label: 'Sarı Kart' },
      'Red Cards':        { label: 'Kırmızı Kart' },
      'Goalkeeper Saves': { label: 'Kurtarış' },
      'Total passes':     { label: 'Pas' },
      'Passes %':         { label: 'Pas Yüzdesi', type: 'possession' },
    };
    const result = [];
    home.forEach(stat => {
      const meta = LABELS[stat.type];
      if (!meta) return;
      const awayStat = away.find(s => s.type === stat.type);
      let hv = stat.value || 0, av = awayStat ? (awayStat.value || 0) : 0;
      if (typeof hv === 'string') hv = parseInt(hv) || 0;
      if (typeof av === 'string') av = parseInt(av) || 0;
      result.push({ label: meta.label, home: hv, away: av, type: meta.type === 'possession' ? 'possession' : undefined });
    });
    return result;
  }

  function mapLineup(apiLineups) {
    if (!apiLineups || apiLineups.length < 2) return null;
    function mapPlayers(list) {
      return list.map(p => ({ num: p.player.number, name: p.player.name, pos: p.player.pos }));
    }
    return {
      home: { formation: apiLineups[0].formation, starting: mapPlayers(apiLineups[0].startXI || []), subs: mapPlayers(apiLineups[0].substitutes || []), coach: apiLineups[0].coach?.name || '' },
      away: { formation: apiLineups[1].formation, starting: mapPlayers(apiLineups[1].startXI || []), subs: mapPlayers(apiLineups[1].substitutes || []), coach: apiLineups[1].coach?.name || '' },
    };
  }

  function mapH2H(apiFixtures, homeTeamId, awayTeamId) {
    let hw = 0, d = 0, aw = 0;
    const matches = apiFixtures.slice(0, 10).map(f => {
      const hGoals = f.goals.home ?? 0, aGoals = f.goals.away ?? 0;
      const isHomeFirst = String(f.teams.home.id) === String(homeTeamId);
      const oh = isHomeFirst ? hGoals : aGoals, oa = isHomeFirst ? aGoals : hGoals;
      if (oh > oa) hw++; else if (oh < oa) aw++; else d++;
      const dt = new Date(f.fixture.date);
      return { date: dt.toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' }), homeScore: oh, awayScore: oa };
    });
    return { wins: { home: hw, draw: d, away: aw }, matches };
  }

  /* ── FİKSTÜR MAPPER (team.js için) ──────────── */
  function mapTeamFixture(f, teamId) {
    const fix = f.fixture, teams = f.teams, goals = f.goals;
    const lg  = f.league;
    const lc  = LEAGUE_MAP[parseInt(lg.id)] || { name: lg.name, flag: '🏆' };
    const isHome   = String(teams.home.id) === String(teamId);
    const shortSt  = fix.status.short;
    const liveStatuses = ['1H','HT','2H','ET','BT','P','LIVE'];
    const doneStatuses = ['FT','AET','PEN'];
    let status = 'upcoming';
    if (liveStatuses.includes(shortSt)) status = 'live';
    else if (doneStatuses.includes(shortSt)) status = 'finished';
    const myGoals  = isHome ? goals.home : goals.away;
    const oppGoals = isHome ? goals.away : goals.home;
    const opp      = isHome ? teams.away : teams.home;
    const kt       = new Date(fix.date);
    return {
      id:         String(fix.id),
      fixtureId:  fix.id,
      isHome,
      oppId:      String(opp.id),
      oppName:    opp.name,
      oppLogo:    opp.logo || '',
      myGoals:    myGoals !== null ? myGoals : null,
      oppGoals:   oppGoals !== null ? oppGoals : null,
      status,
      minute:     fix.status.elapsed,
      leagueName: lc.name || lg.name,
      leagueFlag: lc.flag || '🏆',
      date:       kt.toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' }),
      time:       kt.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }),
      matchweek:  lg.round || '',
    };
  }

  return {
    getTodayFixtures,
    getTeamFixtures,
    getFixtureById,
    getFixtureStats,
    getFixtureLineups,
    getFixtureEvents,
    getH2H,
    getStandings,
    mapTeamFixture,
    mapEvents,
    mapStats,
    mapLineup,
    mapH2H,
    getTeamColor,
    getTeamColor2,
    getTeamShort,
    currentSeason,
  };
})();
