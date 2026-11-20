/* СЛОВОПАД — гифки из Giphy (вместо закрытого Tenor).
   В чат уходит короткий код вида :g:ID: , картинка берётся по этому коду с media.giphy.com (ключ для показа не нужен).
   Ключ нужен только для поиска. Вставь свой ключ с developers.giphy.com в KEY ниже (или в localStorage "giphyKey" для проверки).
   window.SlovopadGif: ready, search, trending, token, parse, url, thumb, label. */
(function () {
  "use strict";
  const KEY = "CLOPlxuWWf1efDSxFeJjwhEtyCMDmmys";
  const key = () => { try { return localStorage.getItem("giphyKey") || KEY } catch (e) { return KEY } };
  const lang = () => { try { return (JSON.parse(localStorage.getItem("cfg") || "{}").lang || "ru").slice(0, 2) } catch (e) { return "ru" } };
  const API = "https://api.giphy.com/v1/gifs/";
  const cut = r => ((r && r.data) || []).map(x => ({ id: x.id, w: +(x.images && x.images.fixed_width_small && x.images.fixed_width_small.width) || 100, h: +(x.images && x.images.fixed_width_small && x.images.fixed_width_small.height) || 100, thumb: x.images && x.images.fixed_width_small ? x.images.fixed_width_small.url : "https://media.giphy.com/media/" + x.id + "/100w.gif" })).filter(x => /^[A-Za-z0-9]{5,24}$/.test(x.id));
  const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status === 429 ? "limit" : "http " + r.status); return r.json() };
  window.SlovopadGif = {
    ready: () => !!key(),
    search: async q => cut(await get(API + "search?api_key=" + encodeURIComponent(key()) + "&q=" + encodeURIComponent(q) + "&limit=24&rating=pg-13&lang=" + lang())),
    trending: async () => cut(await get(API + "trending?api_key=" + encodeURIComponent(key()) + "&limit=24&rating=pg-13")),
    token: id => ":g:" + id + ":",
    parse: body => { const m = /^:g:([A-Za-z0-9]{5,24}):$/.exec(String(body || "").trim()); return m ? m[1] : "" },
    url: id => "https://media.giphy.com/media/" + id + "/200w.gif",
    thumb: id => "https://media.giphy.com/media/" + id + "/100w.gif",
    label: body => window.SlovopadGif.parse(body) ? "GIF" : ""
  };
})();
