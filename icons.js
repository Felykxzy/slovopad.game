/* Свои иконки СЛОВОПАДА: линейные, в одном стиле. Используются вместо эмодзи в Эхо и звонке.
   В тексте иконку можно вставить так: "{mic} Микрофон". */
(function () {
  "use strict";
  var P = {
    echo: '<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.2" cy="9" r="2.4"/><path d="M17.6 13.9c2.4.3 4.4 1.9 4.4 4.6"/>',
    bot: '<rect x="4" y="8" width="16" height="11" rx="3.5"/><path d="M12 8V5.5"/><circle cx="12" cy="4.3" r="1.1"/><circle cx="9" cy="13" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1.1" fill="currentColor" stroke="none"/><path d="M9.5 16.2h5M2.5 12.5v2M21.5 12.5v2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    send: '<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/>',
    phone: '<path d="M5.2 3.5h3.3l1.8 4.6-2.3 1.5a11.5 11.5 0 0 0 5.4 5.4l1.5-2.3 4.6 1.8v3.3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 3.2 5.6a2 2 0 0 1 2-2.1z"/>',
    hangup: '<g transform="rotate(135 12 12)"><path d="M5.2 3.5h3.3l1.8 4.6-2.3 1.5a11.5 11.5 0 0 0 5.4 5.4l1.5-2.3 4.6 1.8v3.3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 3.2 5.6a2 2 0 0 1 2-2.1z"/></g>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
    "mic-off": '<path d="M9 9V6a3 3 0 0 1 5.6-1.5M15 10v1a3 3 0 0 1-4.7 2.5"/><path d="M5.5 11a6.5 6.5 0 0 0 10.3 5.3M18.5 11a6.4 6.4 0 0 1-.5 2.5M12 17.5V21M9 21h6M4 4l16 16"/>',
    cam: '<rect x="3" y="6.5" width="13" height="11" rx="2.6"/><path d="M16 11l5-3v8l-5-3z"/>',
    "cam-off": '<path d="M7.5 6.5H13a3 3 0 0 1 3 3v6M16 11l5-3v8l-3-1.8M3 9.5v5a3 3 0 0 0 3 3h7M4 4l16 16"/>',
    flip: '<path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/>',
    speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>',
    flag: '<path d="M5 21V4M5 4.5h11.5l-2.2 3.8 2.2 3.7H5"/>',
    crown: '<path d="M3.5 8l4.6 4.2L12 5l3.9 7.2L20.5 8 19 18.5H5z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    hash: '<path d="M9.5 4L7.5 20M16.5 4l-2 16M4 9h16.5M3.5 15H20"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    dots: '<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    reply: '<path d="M10 6L4 12l6 6"/><path d="M4 12h9a7 7 0 0 1 7 7"/>',
    chart: '<path d="M5 20v-9M12 20V4M19 20v-6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    letters: '<path d="M2.5 18L7.5 6l5 12M4.5 14h6"/><path d="M18 12.2a3 3 0 1 0 0 5.6 3 3 0 0 0 0-5.6zM21 12v6"/>',
    idea: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>',
    swords: '<path d="M5 19l9-9M14 4h6v6l-9 9-3 .8.8-3zM19 19l-9-9M10 4H4v6"/>',
    smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0"/><circle cx="9.3" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10" r=".9" fill="currentColor" stroke="none"/>',
    screen: '<rect x="3" y="4.5" width="18" height="12.5" rx="2.6"/><path d="M8.5 20.5h7M12 17v3.5M9.3 11.4L12 8.7l2.7 2.7M12 8.7v5.2"/>',
    signal: '<path d="M5 19v-3M10 19v-6M15 19V9M20 19V5"/>',
    "arrow-r": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" fill-opacity=".2"/>',
    pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" fill-opacity=".2"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" fill-opacity=".2"/>',
    star: '<path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.6l5.9-.8z" fill="currentColor" fill-opacity=".2"/>',
    "star-o": '<path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.6l5.9-.8z"/>',
    warn: '<path d="M12 4l9.2 16H2.8z" fill="currentColor" fill-opacity=".2"/><path d="M12 10v4.2M12 17.2v.1"/>',
    edit: '<path d="M4 20l1-4.2L16.4 4.4a2.1 2.1 0 0 1 3 3L8 19z" fill="currentColor" fill-opacity=".2"/><path d="M14.6 6.2l3.2 3.2"/>',
    eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity=".2"/>',
    hand: '<path d="M8.2 12.5V6.2a1.4 1.4 0 0 1 2.8 0v5.3M11 11V4.7a1.4 1.4 0 0 1 2.8 0V11M13.8 11V6a1.4 1.4 0 0 1 2.8 0v7.2a6.4 6.4 0 0 1-6.4 6.4h-.3a5.4 5.4 0 0 1-4.6-2.6l-2-3.4a1.4 1.4 0 0 1 2.4-1.4l1.5 2.2" fill="currentColor" fill-opacity=".2"/>',
    sparkle: '<path d="M11 3.5c.8 4.8 2.7 6.7 7.5 7.5-4.8.8-6.7 2.7-7.5 7.5-.8-4.8-2.7-6.7-7.5-7.5C8.3 10.2 10.2 8.3 11 3.5z" fill="currentColor" fill-opacity=".2"/><path d="M19 3.5v3.4M17.3 5.2h3.4M18.5 16.5v3M17 18h3"/>',
    swap: '<path d="M4 8h14.5L15 4.5M20 16H5.5L9 19.5"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.8 7l.9 13h8.6l.9-13" fill="currentColor" fill-opacity=".2"/><path d="M10 11v6M14 11v6"/>',
    mobile: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.6"/><path d="M11 18.2h2"/>',
    megaphone: '<path d="M4 9.5v5l10 4.5V5z" fill="currentColor" fill-opacity=".2"/><path d="M14 8.5c3 .4 5 1.7 5 3.5s-2 3.1-5 3.5M6.5 15l1.2 4.5h2.6L9.2 16"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4.5" rx="1.2" fill="currentColor" fill-opacity=".2"/><path d="M5 13v7.5h14V13M12 8.5v12M12 8.5S9.8 3.8 7.7 5.3 9.3 8.5 12 8.5zm0 0s2.2-4.7 4.3-3.2S14.7 8.5 12 8.5z"/>',
    chat: '<path d="M4 5.5h16v11H11.5l-4.5 3.8v-3.8H4z" fill="currentColor" fill-opacity=".2"/>',
    swords: '<path d="M4.5 4.5l10.2 10.2M4.5 4.5v3.8M4.5 4.5h3.8M19.5 4.5L9.3 14.7M19.5 4.5v3.8M19.5 4.5h-3.8M12.2 17.2l-2.2-2.2M7.6 17.6l2.4-2.6-2.6 2.6M11.8 17.2l4.2 4M16.4 17.6l-2.4-2.6"/>',
    cap: '<path d="M2.5 9L12 4.2 21.5 9 12 13.8z" fill="currentColor" fill-opacity=".2"/><path d="M6.2 11.4v4.5c0 1.6 2.6 3 5.8 3s5.8-1.4 5.8-3v-4.5M21.5 9v5.5"/>',
    idcard: '<rect x="3" y="5.5" width="18" height="13" rx="2.6" fill="currentColor" fill-opacity=".2"/><circle cx="8.8" cy="11" r="1.9"/><path d="M5.8 16c.5-1.7 1.8-2.5 3-2.5s2.5.8 3 2.5M14.5 10h4M14.5 13.5h3"/>',
    gamepad: '<rect x="2.8" y="7" width="18.4" height="11" rx="5" fill="currentColor" fill-opacity=".2"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9" fill="currentColor" stroke="none"/><circle cx="17.8" cy="13.8" r=".9" fill="currentColor" stroke="none"/>',
    joystick: '<circle cx="12" cy="5.8" r="2.8" fill="currentColor" fill-opacity=".2"/><path d="M12 8.6v6M5 20h14v-2.8a2.6 2.6 0 0 0-2.6-2.6H7.6A2.6 2.6 0 0 0 5 17.2z"/>',
    trophy: '<path d="M7 4h10v5.2a5 5 0 0 1-10 0z" fill="currentColor" fill-opacity=".2"/><path d="M7 6H4v1.6A3 3 0 0 0 7 10.6M17 6h3v1.6a3 3 0 0 1-3 3M12 14.2V18M8 20.5h8M9.4 18h5.2"/>',
    note: '<path d="M6 3.5h8.5L19 8v12.5H6z" fill="currentColor" fill-opacity=".2"/><path d="M14.5 3.5V8H19M9.3 12.5h6M9.3 16h6"/>',
    hundred: '<text x="12" y="14.5" text-anchor="middle" font-size="9.5" font-weight="800" fill="currentColor" stroke="none" font-family="Inter,Segoe UI,sans-serif">100</text><path d="M4.5 18.5h15M6.5 20.8h11"/>',
    rocket: '<path d="M12 2.8c3.3 2.2 4.8 5.6 4.5 9.4l-2.2 3.6H9.7L7.5 12.2C7.2 8.4 8.7 5 12 2.8z" fill="currentColor" fill-opacity=".2"/><circle cx="12" cy="9.5" r="1.5"/><path d="M9.7 15.8L6.5 19.8l3.6-1M14.3 15.8l3.2 4-3.6-1M12 18.4v3"/>',
    burst: '<path d="M12 2.6l2 5.3 4.8-3-1.7 5.5 5.6.1-4.6 3.3 3.3 4.5-5.4-1.2-1 5.5L12 17.8l-3 4.8-1-5.5-5.4 1.2 3.3-4.5L1.3 9.5l5.6-.1-1.7-5.5L10 6.9z" fill="currentColor" fill-opacity=".2"/>',
    bolt: '<path d="M13.2 2.5L5 13.6h6l-1 7.9 8.2-11.3h-6z" fill="currentColor" fill-opacity=".2"/>',
    tornado: '<path d="M3.5 5h17M5.5 9h13M7.5 13h9M9.5 17h5M11.5 21h2"/>',
    mountain: '<path d="M2.5 19.5l6.7-11.3 4 6.6 2.3-3.5 6 8.2z" fill="currentColor" fill-opacity=".2"/><path d="M7.8 10.6l1.4 1.6 1.3-1.2"/>',
    shield: '<path d="M12 3l7.6 3v5.6c0 4.6-3.1 8.1-7.6 9.6-4.5-1.5-7.6-5-7.6-9.6V6z" fill="currentColor" fill-opacity=".2"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
    keyboard: '<rect x="2.5" y="6.5" width="19" height="11.5" rx="2.6" fill="currentColor" fill-opacity=".2"/><path d="M6.3 10.2h.1M9.4 10.2h.1M12.5 10.2h.1M15.6 10.2h.1M18 10.2h.1M6.3 13.2h.1M9.4 13.2h.1M12.5 13.2h.1M15.6 13.2h.1M8 15.6h8"/>',
    gauge: '<path d="M3.8 17.5a9 9 0 1 1 16.4 0z" fill="currentColor" fill-opacity=".2"/><path d="M12 14.5l3.8-4.6"/><circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>',
    heart: '<path d="M12 20.4S3.8 14.9 3.8 9.2A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.2 2.8c0 5.7-8.2 11.2-8.2 11.2z" fill="currentColor" fill-opacity=".2"/>',
    flame: '<path d="M12 2.8c1.2 3.8 5.3 5.4 5.3 10.6A5.3 5.3 0 0 1 12 18.7a5.3 5.3 0 0 1-5.3-5.3c0-2.2 1-3.5 2.2-4.4.3 1.6 1 2.3 2 2.5C10.4 8.2 11 5.6 12 2.8z" fill="currentColor" fill-opacity=".2"/><path d="M12 21.2a3 3 0 0 1-3-3 3 3 0 0 1 3-2.7 3 3 0 0 1 3 2.7 3 3 0 0 1-3 3z" stroke-width="1.3"/>',
    calendar: '<rect x="3.8" y="5.2" width="16.4" height="15" rx="2.6" fill="currentColor" fill-opacity=".2"/><path d="M3.8 10h16.4M8.4 3.2v4M15.6 3.2v4"/><path d="M8.5 14.2h.1M12 14.2h.1M15.5 14.2h.1" stroke-width="2.4"/>',
    calendar2: '<rect x="3.8" y="5.2" width="16.4" height="15" rx="2.6" fill="currentColor" fill-opacity=".2"/><path d="M3.8 10h16.4M8.4 3.2v4M15.6 3.2v4M8 13.5h.1M12 13.5h.1M16 13.5h.1M8 17h.1M12 17h.1M16 17h.1" stroke-width="2"/>',
    compass: '<circle cx="12" cy="12" r="8.8"/><path d="M15.8 8.2l-1.8 5.8-5.8 1.8L10 10z" fill="currentColor" fill-opacity=".2"/>',
    globe: '<circle cx="12" cy="12" r="8.8"/><path d="M3.2 12h17.6M12 3.2c3.2 3.2 3.2 14.4 0 17.6M12 3.2c-3.2 3.2-3.2 14.4 0 17.6"/>',
    bag: '<path d="M5 8h14l1 12.5H4z" fill="currentColor" fill-opacity=".2"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8M9 12.2a3 3 0 0 0 6 0"/>',
    owl: '<path d="M5.5 4l3.2 2.2h6.6L18.5 4v9.4a6.5 6.5 0 0 1-13 0z" fill="currentColor" fill-opacity=".2"/><circle cx="9.2" cy="11" r="1.9"/><circle cx="14.8" cy="11" r="1.9"/><path d="M12 13.2l-1 2h2z"/>',
    medal: '<circle cx="12" cy="14.8" r="5.6" fill="currentColor" fill-opacity=".2"/><path d="M8.2 3.2L10.6 9M15.8 3.2L13.4 9M12 12.2v5.2M10 14.8h4"/>',
    question: '<circle cx="12" cy="12" r="8.8" fill="currentColor" fill-opacity=".2"/><path d="M9.4 9.6a2.7 2.7 0 1 1 3.8 2.5c-.8.4-1.2 1-1.2 1.9M12 17v.1"/>',
    "speaker-low": '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" fill-opacity=".2"/><path d="M15.5 9.2a3.6 3.6 0 0 1 0 5.6"/>',
    "speaker-off": '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" fill-opacity=".2"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    vibrate: '<rect x="8" y="3.8" width="8" height="16.4" rx="2.4" fill="currentColor" fill-opacity=".2"/><path d="M4.5 8v8M19.5 8v8M2 10.5v3M22 10.5v3"/>',
    timer: '<circle cx="12" cy="13.5" r="7.3" fill="currentColor" fill-opacity=".2"/><path d="M12 9.6v4.2l2.8 1.6M9.5 3h5M12 3v3.2"/>',
    bubbles: '<circle cx="9" cy="14.5" r="5.5"/><circle cx="17" cy="8" r="3.4"/><circle cx="16.8" cy="17.6" r="2" fill="currentColor" fill-opacity=".2"/><path d="M6.8 12.6a3 3 0 0 1 1.8-1.4"/>',
    photo: '<path d="M3.5 8h3.4l1.6-2.6h7L17.1 8h3.4v11.5h-17z" fill="currentColor" fill-opacity=".2"/><circle cx="12" cy="13.3" r="3.4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="currentColor" fill-opacity=".2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.6v2.6"/>',
    tag: '<path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z" fill="currentColor" fill-opacity=".2"/><circle cx="8" cy="8.9" r="1.1" fill="currentColor" stroke="none"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.8" fill="currentColor" fill-opacity=".2"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 4"/>',
    city: '<path d="M4.5 20.5V9.5l4.5-2.2v13.2M9 20.5V4.5l6.5 3v13M15.5 20.5v-8l4 1.6v6.4M2.8 20.5h18.4" fill="currentColor" fill-opacity=".2"/><path d="M11.5 9.5h1.6M11.5 13h1.6M11.5 16.5h1.6"/>',
    paw: '<circle cx="6.3" cy="10.2" r="1.8" fill="currentColor" fill-opacity=".2"/><circle cx="9.9" cy="6.3" r="1.8" fill="currentColor" fill-opacity=".2"/><circle cx="14.1" cy="6.3" r="1.8" fill="currentColor" fill-opacity=".2"/><circle cx="17.7" cy="10.2" r="1.8" fill="currentColor" fill-opacity=".2"/><path d="M12 12.2c-3 0-5.6 3.1-5 5.4.4 1.6 2 1.8 5 1.8s4.6-.2 5-1.8c.6-2.3-2-5.4-5-5.4z" fill="currentColor" fill-opacity=".2"/>',
    pizza: '<path d="M12 21L3.8 5.8c5.6-3.1 10.8-3.1 16.4 0z" fill="currentColor" fill-opacity=".2"/><path d="M6.4 9.8c3.6-1.5 7.6-1.5 11.2 0"/><circle cx="10" cy="8.2" r=".9" fill="currentColor" stroke="none"/><circle cx="14" cy="12.5" r=".9" fill="currentColor" stroke="none"/><circle cx="11.5" cy="14.8" r=".9" fill="currentColor" stroke="none"/>',
    ball: '<circle cx="12" cy="12" r="8.8"/><path d="M12 8.2l3.2 2.3-1.2 3.8h-4L8.8 10.5zM12 8.2V3.4M15.2 10.5l4.4-1.4M14 14.3l2.6 3.7M10 14.3L7.4 18M8.8 10.5L4.4 9.1"/>',
    leaf: '<path d="M4.5 19.5C4.5 10.5 9.5 4.5 20 4.5c0 10-6 15-14 15z" fill="currentColor" fill-opacity=".2"/><path d="M4.5 19.5c3-4.3 6.3-7.3 10.5-9.5"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" fill-opacity=".2"/><circle cx="8.8" cy="8.8" r="1" fill="currentColor" stroke="none"/><circle cx="15.2" cy="8.8" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8.8" cy="15.2" r="1" fill="currentColor" stroke="none"/><circle cx="15.2" cy="15.2" r="1" fill="currentColor" stroke="none"/>',
    sprout: '<path d="M12 20.5v-8.5M12 12c0-4.2 3-6.5 7.5-6.5 0 4.2-3 6.5-7.5 6.5zM12 14.5c0-3.2-2.6-5-6.5-5 0 3.6 2.6 5 6.5 5z" fill="currentColor" fill-opacity=".2"/>',
    book: '<path d="M5.5 4.5h10.8a1.9 1.9 0 0 1 1.9 1.9v13.1H7.4a1.9 1.9 0 0 1-1.9-1.9z" fill="currentColor" fill-opacity=".2"/><path d="M5.5 17.6a1.9 1.9 0 0 1 1.9-1.9h10.8M9.5 8.5h5"/>'
  };
  function svg(name, cls) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ic" + (cls ? " " + cls : "")); s.setAttribute("aria-hidden", "true");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.9"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    s.innerHTML = P[name] || ""; return s;
  }
  /* кладёт в элемент текст, где {имя} превращается в иконку */
  function t(el, str) {
    el.textContent = "";
    String(str).split(/(\{[a-z0-9-]+\})/).forEach(function (part) {
      var m = /^\{([a-z0-9-]+)\}$/.exec(part);
      if (m && P[m[1]]) el.appendChild(svg(m[1])); else if (part) el.appendChild(document.createTextNode(part));
    });
    return el;
  }

  /* ---------- автозамена эмодзи в интерфейсе ----------
     Эмодзи остаётся в тексте (скрытый), чтобы код, который читает textContent, работал как раньше. */
  var EM = {
    "✨": ["sparkle", "gold"], "🎓": ["cap"], "🪪": ["idcard"], "🎮": ["gamepad"], "🕹": ["joystick"], "🏆": ["trophy", "gold"], "📝": ["note"], "💯": ["hundred", "red"],
    "⭐": ["star", "gold"], "🚀": ["rocket"], "💥": ["burst", "orange"], "⚡": ["bolt", "gold"], "🌪": ["tornado"], "🧗": ["mountain"], "🏔": ["mountain"], "🛡": ["shield"],
    "🎯": ["target", "red"], "⌨": ["keyboard"], "🏎": ["gauge"], "💗": ["heart", "pink"], "❤️‍🔥": ["heart", "pink"], "🔥": ["flame", "orange"], "📅": ["calendar"], "🗓": ["calendar2"],
    "🧭": ["compass"], "🌐": ["globe"], "🛍": ["bag"], "🦉": ["owl"], "👑": ["crown", "gold"], "🏅": ["medal", "gold"], "❔": ["question"], "❓": ["question"],
    "→": ["arrow-r"], "←": ["back"], "✓": ["check"], "✔": ["check"], "✕": ["close"], "▶": ["play"], "⏸": ["pause"], "★": ["star", "gold"], "☆": ["star-o", "gold"],
    "⚠": ["warn", "orange"], "✎": ["edit"], "👁": ["eye"], "✋": ["hand"], "👋": ["hand"], "⇄": ["swap"], "↩": ["reply"], "➤": ["send"],
    "🔊": ["speaker"], "🔉": ["speaker-low"], "🔇": ["speaker-off"], "📳": ["vibrate"], "⏱": ["timer"], "🫧": ["bubbles"], "📷": ["photo"], "🔒": ["lock"],
    "💡": ["idea", "gold"], "👥": ["people"], "🖼": ["image"], "🏷": ["tag"], "🌀": ["echo"], "⚙": ["sliders"], "📱": ["mobile"], "🗑": ["trash"],
    "📢": ["megaphone"], "🎁": ["gift", "pink"], "💬": ["chat"], "⚔": ["swords"], "🤝": ["people"], "🏙": ["city"], "🌍": ["globe"], "🐾": ["paw"],
    "🍕": ["pizza", "orange"], "⚽": ["ball"], "🌿": ["leaf", "green"], "🎲": ["dice"], "🌱": ["sprout", "green"], "📘": ["book"], "🏁": ["flag"]
  };
  var KEYS = Object.keys(EM).sort(function (a, b) { return b.length - a.length; });
  var RX = new RegExp("(" + KEYS.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\uFE0F?"; }).join("|") + ")", "g");
  var QUICK = /[←-⇿☀-➿⬀-⯿⏩-⏿⌀-⏿\uD83C-\uD83E]/;
  var KEEP = ".ei,.ao,.fav,.mav,.mtx,.rxs,.rx,.chrp,.mq,.cav,.chm,#pcA,#pAv,#sidAv,[data-keep],input,textarea,select,option,script,style,canvas,svg,title";
  function icoFor(ch) { var k = ch.replace(/️/g, ""); return EM[k] || EM[ch]; }
  function conv(node) {
    var v = node.nodeValue; if (!v || !QUICK.test(v)) return;
    var par = node.parentElement; if (!par || par.closest(KEEP)) return;
    var frag = document.createDocumentFragment(), last = 0, m, hit = false; RX.lastIndex = 0;
    while ((m = RX.exec(v))) {
      var d = icoFor(m[0]); if (!d) continue; hit = true;
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      var w = document.createElement("span"); w.className = "ei" + (d[1] ? " c-" + d[1] : "");
      var g = document.createElement("span"); g.className = "g"; g.textContent = m[0]; w.appendChild(g); w.appendChild(svg(d[0]));
      frag.appendChild(w); last = m.index + m[0].length;
    }
    if (!hit) return;
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { conv(root); return; }
    if (root.nodeType !== 1 || root.closest && root.closest(KEEP.replace(/,svg/, ""))) return;
    var w = document.createTreeWalker(root, 4), list = [], n; while ((n = w.nextNode())) if (QUICK.test(n.nodeValue)) list.push(n);
    list.forEach(conv);
  }
  var pend = new Set(), raf = 0;
  function flush() { raf = 0; var a = Array.from(pend); pend.clear(); a.forEach(function (n) { if (n.isConnected !== false) scan(n); }); }
  function queue(n) { pend.add(n); if (!raf) raf = requestAnimationFrame(flush); }
  function auto() {
    scan(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === "characterData") queue(m.target);
        else m.addedNodes.forEach(function (n) { if (n.nodeType === 3 || n.nodeType === 1) queue(n); });
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();
  function html(name, cls) { return svg(name, cls).outerHTML }
  window.IC = { svg: svg, t: t, html: html, has: function (n) { return !!P[n]; } };
})();
