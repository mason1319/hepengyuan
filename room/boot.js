/* 何鹏远个人网站 —— hi-fi 版启动器

   决定这位访客该看 3D 房间还是静态版，并负责房间里的一切 HTML：顶部导航、
   右下角的按钮、光标提示，以及推近镜头后盖在屏幕上的内容面板。
   面板里的文字和链接全部从首页已经服务器直出的栏目里读取（#work、#posts、
   #contact……），房间不保存任何自己的事实副本。录像带里的影像只有两个来源：
   首页 #personal-film 里的宣传片，以及只返回已发布内容的 /api/media.json。

   原则：房间只是盖在静态首页上的一层。任何一步出错都直接退回静态版。

   <html data-room> 的状态：boot（<head> 内联脚本预判）→ loading → on →
   leaving → 移除。样式在 /styles.css 的「hi-fi 房间」一节。 */
(() => {
  "use strict";

  const SCENE_URL = "/room/scene.js?v=20261113-room90";
  const POSTER_URL = "/assets/hpy-promo-poster.jpg";

  const PREF_KEY = "hpy-room"; /* "off" 访客自己选了静态版；"auto-off" 实测跑不动 */
  const SEEN_KEY = "hpy-room-seen"; /* 本次会话已经进过房间，回到首页不再自动弹出 */
  const NOTICE_KEY = "hpy-static-notice"; /* "off" 静态版提示已被关掉 */
  const FADE_MS = 460;
  const LOAD_TIMEOUT_MS = 12000; /* 超过这个时间还没布置好，就不让访客继续对着黑屏等 */

  const root = document.documentElement;

  /* ---------------------------------------------------------------- 语言
     页面的 <html lang> 决定房间用哪种语言；正文内容仍然全部从当前页面读取。 */
  const LANG = (() => {
    const value = (root.getAttribute("lang") || "zh").toLowerCase();
    if (value.startsWith("en")) return "en";
    if (value.startsWith("de")) return "de";
    if (value.startsWith("ko")) return "ko";
    return "zh";
  })();
  const LANG_PAGES = [
    { lang: "zh", path: "/", label: "简体中文", short: "简体" },
    { lang: "en", path: "/en/", label: "English", short: "EN" },
    { lang: "de", path: "/de/", label: "Deutsch", short: "DE" },
    { lang: "ko", path: "/ko/", label: "한국어", short: "한국어" },
  ];
  const STRINGS = {
    zh: {
      menu: { about: "关于", work: "履历", posts: "文章", film: "录像带", music: "音乐", online: "联系", services: "服务" },
      buttons: { back: "回到桌面", notepad: "放下记事本", eject: "退带", hangup: "挂断", calc: "放下计算器", play: "播放", pause: "暂停", next: "下一段", credits: "致谢", soundOn: "声音：开", soundOff: "声音：关", lofi: "静态版", view: "视角" },
      noticeIntro: "个人网站是互联网上少数还能好玩的地方，所以这里还有一个可交互的版本。",
      reasons: {
        "no-webgl": "你的浏览器没有提供 WebGL 2，所以看到的是这个静态版本。",
        software: "你的浏览器现在没有硬件加速，3D 只能用软件渲染，所以被送到了这个静态版本。",
        "low-end": "你的设备被识别为可能跑不动它，所以被送到了这个静态版本。",
        "save-data": "你开启了省流量模式，所以默认给你这个静态版本。",
        "slow-network": "你当前的网络比较慢，所以默认给你这个静态版本。",
        "reduced-motion": "你的系统开启了「减少动态效果」，所以默认给你这个静态版本。",
        slow: "刚才在你的设备上试着运行过，帧率太低，所以换回了这个静态版本。",
        "load-failed": "可交互的版本这次没能加载成功，所以先给你这个静态版本。",
        "context-lost": "浏览器中断了 3D 渲染，所以换回了这个静态版本。",
      },
      nav: { about: "关于我", work: "履历与作品", posts: "文章与档案", film: "录像带", music: "录音机 · 原创音乐", online: "联系方式" },
      hints: {
        desk: "A 关于 · W 履历 · P 文章 · F 录像带 · O 联系 · C 计算器 · M 录音机 · L 台灯",
        calc: "数字键与 + − × ÷ 计算 · Enter 等于 · Backspace 退格 · Delete 清零 · ESC 放下",
        orbit: "拖动 转视角 · 右键拖动 平移 · 滚轮 缩放 · 双击 复位",
        music: "点磁带放进录音机 · 空格 播放 / 暂停 · ← → 上一首 / 下一首 · S 停止退带 · ESC 回到桌面",
        about: "↑ ↓ 滚动 · 1–5 功能键 · ESC 回到桌面",
        work: "点条目打开 · ESC 放下记事本",
        posts: "1–9 打开 · ESC 回到桌面",
        film: "空格 暂停 · ← → 上一段 / 下一段 · 1–4 换带 · ESC 退带",
        online: "1–8 打开或复制 · ESC 挂断",
      },
      tapes: { promo: "宣传片", travel: "旅行", learning: "学习", music: "音乐" },
      postsHeading: "文章 POSTS",
      postsFoot: "按数字键打开 · ESC 回到桌面",
      onlineFind: "在这些地方找到我：",
      onlineCopy: "复制",
      onlineFoot: "按 1–8 打开或复制 · ESC 挂断",
      workCareer: "履历",
      workProjects: "作品",
      filmTapPlay: "点画面播放",
      filmCantPlay: "此设备无法播放这段视频",
      play: "继续播放（空格）",
      pause: "暂停（空格）",
      overlay: "可交互的 3D 房间。顶部导航可以打开各个栏目，LO-FI 切到静态版。",
      roomNav: "房间导航",
      back: "回到桌面（Esc）",
      next: "下一段（→）",
      sound: "雨声",
      lofi: "切到静态版，并记住这个选择",
      loading: "正在布置房间…",
      language: "语言 / Language",
      credits: [
        ["场景", "程序化建模，没有使用外部模型"],
        ["渲染", "three.js r170 · MIT"],
        ["字体", "Literata · Fira Sans · Fira Code · VT323 · OFL"],
        ["雨声", "浏览器现场合成"],
        ["录像带", "宣传片取自首页；旅行与学习影像只来自已公开的影像档案"],
        ["布局灵感", "Felix Rieseberg 的个人网站 felixrieseberg.com"],
      ],
      hotspots: {},
      tvInsert: "",
      tapAgain: "再点一次",
      calc: { name: "计算器", display: "计算器显示", clear: "清零", sign: "正负号", percent: "百分比", divide: "除以", multiply: "乘以", minus: "减", plus: "加", equals: "等于", back: "退格", point: "小数点", error: "错误" },
      music: { side: "SIDE A", title: "音乐", pick: "选一盒磁带，放进录音机", loading: "正在倒带…", cantPlay: "这台设备放不了这段音频", tapPlay: "点 ▶ 开始播放", prev: "上一首", play: "播放 / 暂停", next: "下一首", stop: "停止并退带", view: "切换视角（V）" },
    },
    en: {
      menu: { about: "ABOUT", work: "WORK", posts: "POSTS", film: "FILM", music: "MUSIC", online: "ONLINE", services: "SERVICES" },
      buttons: { back: "BACK TO DESK", notepad: "PUT DOWN NOTEPAD", eject: "EJECT", hangup: "HANG UP", calc: "PUT DOWN CALCULATOR", play: "PLAY", pause: "PAUSE", next: "NEXT", credits: "CREDITS", soundOn: "SOUND ON", soundOff: "SOUND OFF", lofi: "LO-FI", view: "VIEW" },
      noticeIntro: "Personal websites are one of the few places on the internet that can still be fun, so there is also an interactive version here. ",
      reasons: {
        "no-webgl": "Your browser doesn't provide WebGL 2, so you're seeing this static version.",
        software: "Your browser has no hardware acceleration right now and could only render 3D in software, so you were sent to this static version.",
        "low-end": "Your device looks like it might not be able to run it, so you were sent to this static version.",
        "save-data": "You have data saver turned on, so you get this static version by default.",
        "slow-network": "Your connection is slow right now, so you get this static version by default.",
        "reduced-motion": "Your system has “reduce motion” turned on, so you get this static version by default.",
        slow: "We just tried it on your device and the frame rate was too low, so we switched back to this static version.",
        "load-failed": "The interactive version didn't load this time, so here is the static version for now.",
        "context-lost": "Your browser stopped the 3D rendering, so we switched back to this static version.",
      },
      nav: { about: "About me", work: "Career & projects", posts: "Posts & archives", film: "Videotapes", music: "Boombox · original music", online: "Contact" },
      hints: {
        desk: "A about · W work · P posts · F tapes · O online · C calculator · M recorder · L lamp",
        calc: "Digits and + − × ÷ to calculate · Enter equals · Backspace delete · Delete clear · ESC put it down",
        orbit: "Drag to look around · right-drag to pan · scroll to zoom · double-click to reset",
        music: "Pick a cassette · Space play / pause · ← → previous / next · S stop & eject · ESC back to desk",
        about: "↑ ↓ scroll · 1–5 function keys · ESC back to desk",
        work: "Click an entry to open it · ESC put down the notepad",
        posts: "1–9 open · ESC back to desk",
        film: "Space pause · ← → previous / next · 1–4 switch tape · ESC eject",
        online: "1–8 open or copy · ESC hang up",
      },
      tapes: { promo: "Promo film", travel: "Travel", learning: "Learning", music: "Music" },
      postsHeading: "POSTS",
      postsFoot: "Press a number to open · ESC back to desk",
      onlineFind: "Find me here:",
      onlineCopy: "copy",
      onlineFoot: "Press 1–8 to open or copy · ESC hang up",
      workCareer: "Career",
      workProjects: "Projects",
      filmTapPlay: "Tap the screen to play",
      filmCantPlay: "This device can't play this video",
      play: "Play (Space)",
      pause: "Pause (Space)",
      overlay: "Interactive 3D room. Use the top menu to open each section; LO-FI switches to the static version.",
      roomNav: "Room navigation",
      back: "Back to the desk (Esc)",
      next: "Next (→)",
      sound: "Rain sound",
      lofi: "Switch to the static version and remember this choice",
      loading: "Setting up the room…",
      language: "Language",
      credits: [
        ["Scene", "Procedurally modelled, no external models"],
        ["Rendering", "three.js r170 · MIT"],
        ["Fonts", "Literata · Fira Sans · Fira Code · VT323 · OFL"],
        ["Rain", "Synthesized live in the browser"],
        ["Tapes", "The promo film comes from the homepage; travel and learning media come only from the published media archive"],
        ["Layout inspiration", "Felix Rieseberg's personal website felixrieseberg.com"],
      ],
      hotspots: {
        about: "About me", work: "Career & projects", posts: "Posts & archives", film: "Tapes · promo film & media",
        online: "Contact", services: "Services (in Chinese)", game: "Aggie 3A interactive demo", lamp: "Lamp on/off", tape: "Boombox · play a cassette", cassette: "Put it in the boombox", book: "Projects",
        deckPlay: "Play / pause", deckPause: "Pause", deckStop: "Stop · eject", deckNext: "Next track", deckPrev: "Previous track", deckRec: "Record key (just for fun)", calc: "Calculator · pick it up",
        tvPower: "TV on/off", tvPreset: "Channel presets 1–6", tvChannel: "Change channel", tvVolume: "Volume", pcPower: "Computer on/off", pcBright: "Screen brightness",
      },
      tvInsert: "Insert a tape · FILM",
      tapAgain: "TAP AGAIN",
      calc: { name: "Calculator", display: "Calculator display", clear: "Clear", sign: "Change sign", percent: "Percent", divide: "Divide", multiply: "Multiply", minus: "Minus", plus: "Plus", equals: "Equals", back: "Backspace", point: "Decimal point", error: "Error" },
      music: { side: "SIDE A", title: "Music", pick: "Pick a cassette to put in the boombox", loading: "Rewinding…", cantPlay: "This device can't play this audio", tapPlay: "Tap ▶ to play", prev: "Previous", play: "Play / pause", next: "Next", stop: "Stop and eject", view: "Switch view (V)" },
    },
    de: {
      menu: { about: "ÜBER MICH", work: "WERDEGANG", posts: "BEITRÄGE", film: "FILM", music: "MUSIK", online: "KONTAKT", services: "LEISTUNGEN" },
      buttons: { back: "ZUM SCHREIBTISCH", notepad: "NOTIZBLOCK WEGLEGEN", eject: "AUSWERFEN", hangup: "AUFLEGEN", calc: "RECHNER WEGLEGEN", play: "ABSPIELEN", pause: "PAUSE", next: "WEITER", credits: "CREDITS", soundOn: "TON AN", soundOff: "TON AUS", lofi: "LO-FI", view: "ANSICHT" },
      noticeIntro: "Persönliche Websites gehören zu den wenigen Orten im Internet, die noch Spaß machen dürfen – deshalb gibt es hier auch eine interaktive Version. ",
      reasons: {
        "no-webgl": "Dein Browser bietet kein WebGL 2, deshalb siehst du diese statische Version.",
        software: "Dein Browser hat gerade keine Hardwarebeschleunigung und könnte 3D nur per Software darstellen, deshalb siehst du diese statische Version.",
        "low-end": "Dein Gerät schafft die interaktive Version vermutlich nicht, deshalb siehst du diese statische Version.",
        "save-data": "Du hast den Datensparmodus aktiviert, deshalb zeigen wir standardmäßig diese statische Version.",
        "slow-network": "Deine Verbindung ist gerade langsam, deshalb zeigen wir standardmäßig diese statische Version.",
        "reduced-motion": "Dein System hat „Bewegung reduzieren“ aktiviert, deshalb zeigen wir standardmäßig diese statische Version.",
        slow: "Wir haben es eben auf deinem Gerät versucht, aber die Bildrate war zu niedrig – deshalb wieder die statische Version.",
        "load-failed": "Die interaktive Version konnte diesmal nicht geladen werden, deshalb vorerst die statische Version.",
        "context-lost": "Dein Browser hat das 3D-Rendering unterbrochen, deshalb wieder die statische Version.",
      },
      nav: { about: "Über mich", work: "Werdegang & Projekte", posts: "Beiträge & Archive", film: "Videokassetten", music: "Kassettenrekorder · eigene Musik", online: "Kontakt" },
      hints: {
        desk: "A Über mich · W Werdegang · P Beiträge · F Kassetten · O Kontakt · C Rechner · M Rekorder · L Lampe",
        calc: "Ziffern und + − × ÷ zum Rechnen · Enter gleich · Rücktaste löschen · Entf zurücksetzen · ESC weglegen",
        orbit: "Ziehen zum Umsehen · Rechts ziehen zum Verschieben · Scrollen zum Zoomen · Doppelklick zurücksetzen",
        music: "Kassette wählen · Leertaste Wiedergabe / Pause · ← → zurück / weiter · S Stopp & Auswurf · ESC zum Schreibtisch",
        about: "↑ ↓ scrollen · 1–5 Funktionstasten · ESC zurück zum Schreibtisch",
        work: "Eintrag anklicken zum Öffnen · ESC Notizblock weglegen",
        posts: "1–9 öffnen · ESC zurück zum Schreibtisch",
        film: "Leertaste Pause · ← → zurück / weiter · 1–4 Kassette wechseln · ESC auswerfen",
        online: "1–8 öffnen oder kopieren · ESC auflegen",
      },
      tapes: { promo: "Imagefilm", travel: "Reisen", learning: "Lernen", music: "Musik" },
      postsHeading: "BEITRÄGE",
      postsFoot: "Zahl drücken zum Öffnen · ESC zurück zum Schreibtisch",
      onlineFind: "Hier findest du mich:",
      onlineCopy: "kopieren",
      onlineFoot: "1–8 öffnen oder kopieren · ESC auflegen",
      workCareer: "Werdegang",
      workProjects: "Projekte",
      filmTapPlay: "Zum Abspielen auf den Bildschirm tippen",
      filmCantPlay: "Dieses Gerät kann dieses Video nicht abspielen",
      play: "Abspielen (Leertaste)",
      pause: "Pause (Leertaste)",
      overlay: "Interaktiver 3D-Raum. Über das Menü oben öffnest du die einzelnen Bereiche; LO-FI wechselt zur statischen Version.",
      roomNav: "Raumnavigation",
      back: "Zurück zum Schreibtisch (Esc)",
      next: "Weiter (→)",
      sound: "Regengeräusch",
      lofi: "Zur statischen Version wechseln und diese Wahl merken",
      loading: "Der Raum wird eingerichtet …",
      language: "Sprache / Language",
      credits: [
        ["Szene", "Prozedural modelliert, keine externen Modelle"],
        ["Rendering", "three.js r170 · MIT"],
        ["Schriften", "Literata · Fira Sans · Fira Code · VT323 · OFL"],
        ["Regen", "Live im Browser erzeugt"],
        ["Kassetten", "Der Imagefilm stammt von der Startseite; Reise- und Lernmedien nur aus dem veröffentlichten Medienarchiv"],
        ["Layout-Idee", "Die persönliche Website von Felix Rieseberg, felixrieseberg.com"],
      ],
      hotspots: {
        about: "Über mich", work: "Werdegang & Projekte", posts: "Beiträge & Archive", film: "Kassetten · Imagefilm & Medien",
        online: "Kontakt", services: "Leistungen (auf Chinesisch)", game: "Interaktive Aggie-3A-Demo", lamp: "Lampe an/aus", tape: "Kassettenrekorder · Kassette abspielen", cassette: "In den Rekorder legen", book: "Projekte",
        deckPlay: "Wiedergabe / Pause", deckPause: "Pause", deckStop: "Stopp · Auswurf", deckNext: "Nächster Titel", deckPrev: "Vorheriger Titel", deckRec: "Aufnahmetaste (nur zum Spaß)", calc: "Taschenrechner · in die Hand nehmen",
        tvPower: "Fernseher ein/aus", tvPreset: "Programmtasten 1–6", tvChannel: "Kanal wechseln", tvVolume: "Lautstärke", pcPower: "Computer ein/aus", pcBright: "Bildschirmhelligkeit",
      },
      tvInsert: "Kassette einlegen · FILM",
      tapAgain: "NOCHMAL TIPPEN",
      calc: { name: "Taschenrechner", display: "Anzeige des Taschenrechners", clear: "Löschen", sign: "Vorzeichen wechseln", percent: "Prozent", divide: "Geteilt durch", multiply: "Mal", minus: "Minus", plus: "Plus", equals: "Gleich", back: "Rücktaste", point: "Dezimalpunkt", error: "Fehler" },
      music: { side: "SEITE A", title: "Musik", pick: "Wähle eine Kassette für den Rekorder", loading: "Spult zurück…", cantPlay: "Dieses Gerät kann diese Audiodatei nicht abspielen", tapPlay: "Tippe ▶ zum Abspielen", prev: "Zurück", play: "Wiedergabe / Pause", next: "Weiter", stop: "Stopp und auswerfen", view: "Ansicht wechseln (V)" },
    },
    ko: {
      menu: { about: "소개", work: "이력", posts: "글", film: "영상", music: "음악", online: "연락처", services: "서비스" },
      buttons: { back: "책상으로", notepad: "메모장 내려놓기", eject: "꺼내기", hangup: "끊기", calc: "계산기 내려놓기", play: "재생", pause: "일시정지", next: "다음", credits: "크레딧", soundOn: "소리 켬", soundOff: "소리 끔", lofi: "정적 버전", view: "시점" },
      noticeIntro: "개인 웹사이트는 인터넷에서 아직 재미있을 수 있는 몇 안 되는 곳이라, 여기에는 인터랙티브 버전도 있습니다. ",
      reasons: {
        "no-webgl": "브라우저가 WebGL 2를 지원하지 않아 정적 버전을 보고 계십니다.",
        software: "지금 브라우저에 하드웨어 가속이 없어 3D를 소프트웨어로만 그릴 수 있기 때문에 정적 버전으로 안내했습니다.",
        "low-end": "사용 중인 기기에서 원활하게 실행되지 않을 것 같아 정적 버전으로 안내했습니다.",
        "save-data": "데이터 절약 모드가 켜져 있어 기본으로 정적 버전을 보여 드립니다.",
        "slow-network": "지금 네트워크가 느려 기본으로 정적 버전을 보여 드립니다.",
        "reduced-motion": "시스템에서 ‘동작 줄이기’가 켜져 있어 기본으로 정적 버전을 보여 드립니다.",
        slow: "방금 기기에서 실행해 보았지만 프레임 속도가 너무 낮아 정적 버전으로 돌아왔습니다.",
        "load-failed": "이번에는 인터랙티브 버전을 불러오지 못해 우선 정적 버전을 보여 드립니다.",
        "context-lost": "브라우저가 3D 렌더링을 중단해 정적 버전으로 돌아왔습니다.",
      },
      nav: { about: "소개", work: "이력과 작업", posts: "글과 아카이브", film: "비디오테이프", music: "카세트 · 창작 음악", online: "연락처" },
      hints: {
        desk: "A 소개 · W 이력 · P 글 · F 테이프 · O 연락처 · C 계산기 · M 카세트 · L 스탠드",
        calc: "숫자와 + − × ÷ 로 계산 · Enter 결과 · Backspace 지우기 · Delete 초기화 · ESC 내려놓기",
        orbit: "드래그로 둘러보기 · 오른쪽 드래그로 이동 · 스크롤로 확대 · 더블클릭으로 원위치",
        music: "카세트 고르기 · Space 재생 / 일시정지 · ← → 이전 / 다음 · S 정지·꺼내기 · ESC 책상으로",
        about: "↑ ↓ 스크롤 · 1–5 기능 키 · ESC 책상으로",
        work: "항목을 눌러 열기 · ESC 메모장 내려놓기",
        posts: "1–9 열기 · ESC 책상으로",
        film: "스페이스 일시정지 · ← → 이전 / 다음 · 1–4 테이프 바꾸기 · ESC 꺼내기",
        online: "1–8 열기 또는 복사 · ESC 끊기",
      },
      tapes: { promo: "홍보 영상", travel: "여행", learning: "학습", music: "음악" },
      postsHeading: "글 POSTS",
      postsFoot: "숫자 키로 열기 · ESC 책상으로",
      onlineFind: "여기에서 만나요:",
      onlineCopy: "복사",
      onlineFoot: "1–8 열기 또는 복사 · ESC 끊기",
      workCareer: "이력",
      workProjects: "작업",
      filmTapPlay: "화면을 눌러 재생",
      filmCantPlay: "이 기기에서는 이 영상을 재생할 수 없습니다",
      play: "재생(스페이스)",
      pause: "일시정지(스페이스)",
      overlay: "인터랙티브 3D 방. 위쪽 메뉴로 각 섹션을 열 수 있고, LO-FI를 누르면 정적 버전으로 바뀝니다.",
      roomNav: "방 내비게이션",
      back: "책상으로 돌아가기(Esc)",
      next: "다음(→)",
      sound: "빗소리",
      lofi: "정적 버전으로 바꾸고 이 선택 기억하기",
      loading: "방을 꾸미는 중…",
      language: "언어 / Language",
      credits: [
        ["장면", "절차적 모델링, 외부 모델 없음"],
        ["렌더링", "three.js r170 · MIT"],
        ["글꼴", "Literata · Fira Sans · Fira Code · VT323 · OFL"],
        ["빗소리", "브라우저에서 실시간 합성"],
        ["비디오테이프", "홍보 영상은 홈페이지에서, 여행·학습 미디어는 공개된 미디어 아카이브에서만 가져옵니다"],
        ["레이아웃 영감", "Felix Rieseberg의 개인 웹사이트 felixrieseberg.com"],
      ],
      hotspots: {
        about: "소개", work: "이력과 작업", posts: "글과 아카이브", film: "테이프 · 홍보 영상과 미디어",
        online: "연락처", services: "서비스(중국어)", game: "Aggie 3A 인터랙티브 데모", lamp: "스탠드 켜기/끄기", tape: "카세트 · 음악 듣기", cassette: "카세트에 넣기", book: "작업",
        deckPlay: "재생 / 일시정지", deckPause: "일시정지", deckStop: "정지 · 꺼내기", deckNext: "다음 곡", deckPrev: "이전 곡", deckRec: "녹음 버튼(그냥 눌러 보기)", calc: "계산기 · 들어서 쓰기",
        tvPower: "TV 켜기/끄기", tvPreset: "채널 프리셋 1–6", tvChannel: "채널 바꾸기", tvVolume: "볼륨", pcPower: "컴퓨터 켜기/끄기", pcBright: "화면 밝기",
      },
      tvInsert: "테이프를 넣어 주세요 · FILM",
      tapAgain: "한 번 더 탭",
      calc: { name: "계산기", display: "계산기 화면", clear: "초기화", sign: "부호 바꾸기", percent: "퍼센트", divide: "나누기", multiply: "곱하기", minus: "빼기", plus: "더하기", equals: "결과", back: "지우기", point: "소수점", error: "오류" },
      music: { side: "SIDE A", title: "음악", pick: "카세트를 골라 넣어 주세요", loading: "되감는 중…", cantPlay: "이 기기에서는 이 오디오를 재생할 수 없습니다", tapPlay: "▶를 눌러 재생", prev: "이전 곡", play: "재생 / 일시정지", next: "다음 곡", stop: "정지하고 꺼내기", view: "시점 바꾸기 (V)" },
    },
  };
  const T = STRINGS[LANG];
  const HOME = LANG_PAGES.find((page) => page.lang === LANG).path;


  /* 顶部导航与快捷键。SERVICES 是离开房间的普通链接。 */
  const NAV = [
    { view: "about", label: T.menu.about, sub: T.nav.about, key: "a" },
    { view: "work", label: T.menu.work, sub: T.nav.work, key: "w" },
    { view: "posts", label: T.menu.posts, sub: T.nav.posts, key: "p" },
    { view: "film", label: T.menu.film, sub: T.nav.film, key: "f" },
    { view: "music", label: T.menu.music, sub: T.nav.music, key: "m" },
    { view: "online", label: T.menu.online, sub: T.nav.online, key: "o" },
  ];
  const LEAVE_LINKS = { services: "/services/", game: "/aggie-3a/" };
  const HINTS = T.hints;
  const DESK_HINT = `${HINTS.desk}\n${HINTS.orbit}`;
  /* 有实体键盘时按钮上补“ · ESC”；手机上没有 Esc 键，不显示。 */
  const ESC = matches("(pointer: fine)") ? " · ESC" : "";
  const BACK_KEYS = { work: "notepad", film: "eject", online: "hangup", calc: "calc" };
  const backLabel = (id) => `${T.buttons[BACK_KEYS[id] || "back"]}${ESC}`;
  /* 不贴在 3D 屏幕上、自己从下面升起来的面板。 */
  const FLOATING = new Set(["work", "calc", "music"]);
  /* 老电脑底部的功能键，和首页导航同一套视图。 */
  const FKEYS = ["about", "online", "posts", "film", "work"];
  const ARCHIVES = [
    { category: "travel", label: T.tapes.travel, en: "TRAVEL", color: "#3a7bd5" },
    { category: "learning", label: T.tapes.learning, en: "LEARNING", color: "#3aa86b" },
  ];
  const IMAGE_SECONDS = 6;

  /* ---------------------------------------------------------------- 存储 */
  const store = (area) => ({
    get(key) {
      try {
        return window[area].getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window[area].setItem(key, value);
      } catch {
        /* 隐私模式下记不住，本次访问内仍然生效。 */
      }
    },
    remove(key) {
      try {
        window[area].removeItem(key);
      } catch {
        /* 同上。 */
      }
    },
  });
  const local = store("localStorage");
  const session = store("sessionStorage");

  /* ---------------------------------------------------------------- 能力判断 */
  function hasContext(attributes) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2", attributes);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      return Boolean(gl);
    } catch {
      return false;
    }
  }

  function matches(query) {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  }

  function probe() {
    const result = { webgl: false, ok: false, reason: "no-webgl", quality: "high" };
    if (!window.WebGL2RenderingContext) return result;

    const hardware = hasContext({ failIfMajorPerformanceCaveat: true });
    if (!hardware && !hasContext({})) return result;
    result.webgl = true;
    if (!hardware) {
      result.reason = "software";
      return result;
    }

    const connection = navigator.connection;
    const memory = navigator.deviceMemory;
    const cores = navigator.hardwareConcurrency;

    if (matches("(prefers-reduced-motion: reduce)")) result.reason = "reduced-motion";
    else if (connection?.saveData) result.reason = "save-data";
    /* 只排除 2g。effectiveType 按往返延迟估算，跨境访问时延迟高但带宽够的访客常被报成 3g，
       而房间总共只有约 200KB（压缩后），不该因此被降级。 */
    else if (/^(slow-2g|2g)$/.test(connection?.effectiveType || "")) result.reason = "slow-network";
    else if ((memory && memory < 4) || (cores && cores < 4)) result.reason = "low-end";
    else {
      result.ok = true;
      result.reason = "";
    }

    const smallScreen = Math.min(window.screen?.width || 9999, window.screen?.height || 9999) < 700;
    if (matches("(pointer: coarse)") || smallScreen || (memory && memory <= 4)) result.quality = "low";
    return result;
  }

  const AUTOMATED = navigator.webdriver === true
    || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|chatgpt-user|claude-user|anthropic-ai|perplexity|bytespider/i
      .test(navigator.userAgent || "");

  /* ---------------------------------------------------------------- 静态版上的入口与提示 */
  const pills = () => document.querySelectorAll("[data-room]:not(html)");

  function showPills(visible) {
    pills().forEach((pill) => {
      pill.hidden = !visible;
    });
  }

  function hideNotice() {
    const box = document.querySelector("#bm-warn");
    if (box) box.hidden = true;
  }

  function showNotice(reason, canRetry) {
    if (local.get(NOTICE_KEY) === "off") return;
    const box = document.querySelector("#bm-warn");
    if (!box) return;

    const text = box.querySelector(".ph-warn-t");
    if (text && T.reasons[reason]) text.textContent = T.noticeIntro + T.reasons[reason];

    const retry = document.querySelector("#bm-try");
    if (retry) retry.hidden = !canRetry;

    const close = document.querySelector("#bm-warn-x");
    if (close && !close.dataset.bound) {
      close.dataset.bound = "1";
      close.hidden = false;
      close.addEventListener("click", () => {
        box.hidden = true;
        local.set(NOTICE_KEY, "off");
      });
    }
    box.hidden = false;
  }

  function cleanUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      url.searchParams.delete("static");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      /* 地址栏清不掉不影响功能。 */
    }
  }

  /* ---------------------------------------------------------------- DOM 小工具 */
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const textOf = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();

  /* 复制首页里的链接：保留 href 和文字，去掉 id，避免和底下的静态页重复。 */
  function linkFrom(anchor, className, text) {
    const link = element("a", className, text ?? textOf(anchor));
    link.href = anchor.getAttribute("href");
    return link;
  }

  /* ---------------------------------------------------------------- 面板：内容取自首页 */
  function buildAbout() {
    const panel = element("section", "room-screen room-crt");
    panel.dataset.view = "about";
    panel.setAttribute("aria-label", T.nav.about);
    const body = element("div", "room-screen-body");
    body.append(element("p", "crt-bar", "HPY-DOS 1.0  ·  ABOUT.TXT"));
    const heading = element("h2", "crt-h", textOf(document.querySelector("main h1")));
    heading.tabIndex = -1;
    body.append(heading);
    const dek = textOf(document.querySelector(".pb-dek"));
    if (dek) body.append(element("p", "crt-p", dek));

    const role = document.querySelector("#aggie-role");
    if (role) {
      body.append(element("p", "crt-k", `> ${textOf(role.querySelector(".pb-hd .t"))} · ${textOf(role.querySelector(".pb-hd .y"))}`));
      const paragraph = role.querySelector("p");
      if (paragraph) body.append(element("p", "crt-p", textOf(paragraph)));
      const tags = element("p", "crt-links");
      role.querySelectorAll(".pb-tags a").forEach((anchor) => tags.append(linkFrom(anchor, "crt-a")));
      if (tags.childElementCount) body.append(tags);
    }
    const note = textOf(document.querySelector("#work .pb-note"));
    if (note) {
      body.append(element("p", "crt-k", "> AI"));
      body.append(element("p", "crt-p", note));
    }
    const more = element("p", "crt-links");
    document.querySelectorAll("main .pb-more a").forEach((anchor) => more.append(linkFrom(anchor, "crt-a")));
    if (more.childElementCount) body.append(more);
    body.append(element("p", "crt-prompt", "C:\\HPY> "));
    panel.append(body, fkeyBar());
    return panel;
  }

  function fkeyBar() {
    const bar = element("p", "crt-keys");
    FKEYS.forEach((id, index) => {
      const nav = NAV.find((item) => item.view === id);
      const key = element("button", "crt-key");
      key.type = "button";
      key.dataset.fkey = String(index + 1);
      key.setAttribute("aria-label", `${nav.label} · ${nav.sub}`);
      key.append(element("span", "crt-key-n", String(index + 1)), element("span", "crt-key-l", nav.label));
      key.addEventListener("click", () => openView(id));
      bar.append(key);
    });
    return bar;
  }

  function buildPosts() {
    const panel = element("section", "room-screen room-ttx");
    panel.dataset.view = "posts";
    panel.setAttribute("aria-label", T.nav.posts);
    const body = element("div", "room-screen-body");
    const bar = element("p", "ttx-bar");
    bar.append(element("span", "", "HPY TELETEXT"), element("span", "", "P100"));
    body.append(bar);
    const heading = element("h2", "ttx-h", T.postsHeading);
    heading.tabIndex = -1;
    body.append(heading);

    const list = element("ol", "ttx-list");
    let n = 0;
    const add = (anchor, title, meta) => {
      n += 1;
      const item = element("li");
      const link = linkFrom(anchor, "ttx-a", "");
      link.dataset.key = String(n);
      link.append(element("span", "ttx-n", String(n).padStart(2, "0")), element("span", "ttx-t", title), element("span", "ttx-d", meta));
      item.append(link);
      list.append(item);
    };
    document.querySelectorAll("#posts .pb-idx a").forEach((anchor) => {
      add(anchor, textOf(anchor.querySelector(".t")) || textOf(anchor), textOf(anchor.querySelector(".d")));
    });
    const all = document.querySelector("#posts .pb-more-link a");
    if (all) add(all, textOf(all).replace(/\s*→$/, ""), "");
    document.querySelectorAll("#posts .pb-item .pb-hd").forEach((head) => {
      const anchor = head.querySelector("a");
      if (anchor) add(anchor, textOf(anchor), textOf(head.querySelector(".y")));
    });
    body.append(list);
    body.append(element("p", "ttx-foot", T.postsFoot));
    panel.append(body);
    return panel;
  }

  function buildOnline() {
    const panel = element("section", "room-screen room-crt room-bbs");
    panel.dataset.view = "online";
    panel.setAttribute("aria-label", T.nav.online);
    const body = element("div", "room-screen-body");
    body.append(element("p", "crt-bar", "HPY BBS  ·  ONLINE"));
    body.append(element("p", "bbs-dial", "ATDT HEPENGYUAN.COM"), element("p", "bbs-dial", "CONNECT 2400"));
    const heading = element("h2", "bbs-h", "HPY BBS");
    heading.tabIndex = -1;
    body.append(heading);
    body.append(element("p", "crt-k", T.onlineFind));

    const list = element("ol", "bbs-list");
    let n = 0;
    const note = element("p", "bbs-note");
    note.setAttribute("role", "status");
    document.querySelectorAll("#contact .on-hd").forEach((head) => {
      const name = textOf(head.querySelector(".t"));
      const anchor = head.querySelector("a");
      const copy = head.querySelector("button[data-copy-public]");
      if (!name || (!anchor && !copy)) return;
      n += 1;
      const item = element("li");
      let control;
      if (anchor) {
        control = linkFrom(anchor, "bbs-row", "");
      } else {
        control = element("button", "bbs-row");
        control.type = "button";
        /* 交给首页原有的复制逻辑（含失败回退），再把它的提示同步过来。 */
        control.addEventListener("click", () => {
          copy.click();
          window.setTimeout(() => {
            note.textContent = textOf(document.querySelector("[data-contact-note]"));
          }, 120);
        });
      }
      control.dataset.key = String(n);
      control.append(
        element("span", "bbs-n", `[${n}]`),
        element("span", "bbs-name", name),
        element("span", "bbs-val", anchor ? textOf(anchor) : `${textOf(copy)} · ${T.onlineCopy}`),
      );
      item.append(control);
      list.append(item);
    });
    body.append(list, note, element("p", "crt-p", T.onlineFoot));
    panel.append(body);
    return panel;
  }

  /* FILM：电视屏幕上的录像机字幕层。画面本身在 3D 电视里播放，这里只放可读的标题。 */
  function buildFilm() {
    const panel = element("section", "room-screen room-tvfx");
    panel.dataset.view = "film";
    panel.setAttribute("aria-label", T.nav.film);
    const heading = element("h2", "sr-only", T.nav.film);
    heading.tabIndex = -1;
    const title = element("p", "tvfx-title");
    title.setAttribute("aria-live", "polite");
    const tapeName = element("p", "tvfx-tape");
    /* 状态（加载中、点画面播放、无信号）单独放在屏幕正中，手机上也不会和左上角的录像机字样挤在一起。 */
    const status = element("p", "tvfx-status");
    status.setAttribute("role", "status");
    panel.append(heading, tapeName, status, title);
    panel.addEventListener("click", () => togglePause());
    panel.setInfo = (tapeText, titleText, statusText = "") => {
      tapeName.textContent = tapeText;
      status.textContent = statusText;
      title.textContent = titleText;
    };
    return panel;
  }

  function buildWork() {
    const pad = element("aside", "room-pad");
    pad.dataset.view = "work";
    pad.setAttribute("aria-label", T.nav.work);
    const body = element("div", "pad-body");
    const heading = element("h2", "pad-h", "Work");
    heading.tabIndex = -1;
    body.append(heading);

    const work = document.querySelector("#work");
    const items = work ? [...work.querySelectorAll(".pb-item")] : [];
    const split = work?.querySelector(".pb-grp");
    const before = (node) => !split || Boolean(node.compareDocumentPosition(split) & Node.DOCUMENT_POSITION_FOLLOWING);

    const section = (title, nodes) => {
      if (!nodes.length) return;
      body.append(element("p", "pad-k", title));
      const list = element("ol", "pad-list");
      nodes.forEach((node, index) => {
        const head = node.querySelector(".pb-hd");
        const titleNode = head?.querySelector(".t");
        const item = element("li");
        item.append(element("span", "pad-n", String(index + 1).padStart(2, "0")));
        const anchor = titleNode?.matches("a") ? titleNode : node.querySelector(".pb-tags a, p a");
        item.append(anchor ? linkFrom(anchor, "pad-t", textOf(titleNode)) : element("span", "pad-t", textOf(titleNode)));
        item.append(element("span", "pad-y", textOf(head?.querySelector(".y"))));
        list.append(item);
      });
      body.append(list);
    };
    section(T.workCareer, items.filter(before));
    section(T.workProjects, items.filter((node) => !before(node)));
    pad.append(body);
    return pad;
  }

  /* ---------------------------------------------------------------- 计算器
     桌上那台计算器拿起来就是这一台：和真的口袋计算器一样按一个数、一个运算符、再一个数、等号；
     连按运算符先算出中间结果，连按等号重复上一步。最多 10 位，超出或除以 0 显示 E，按 C 清掉。 */
  const CALC_DIGITS = 10;
  const OP_SYMBOLS = { divide: "÷", multiply: "×", minus: "−", plus: "+" };
  const calc = { display: "0", stored: null, op: null, fresh: true, error: false, repeat: null };

  function calcFormat(number) {
    if (!Number.isFinite(number) || Math.abs(number) >= 10 ** CALC_DIGITS) return null;
    const abs = Math.abs(number);
    const whole = abs < 1 ? 1 : Math.floor(Math.log10(abs)) + 1;
    let text = abs.toFixed(Math.max(0, CALC_DIGITS - whole));
    if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
    if (text.replace(".", "").length > CALC_DIGITS) return null;
    if (/^0(\.0*)?$/.test(text)) return "0";
    return number < 0 ? `-${text}` : text;
  }

  function calcApply(a, op, b) {
    if (op === "plus") return a + b;
    if (op === "minus") return a - b;
    if (op === "multiply") return a * b;
    if (op === "divide") return b === 0 ? Number.NaN : a / b;
    return b;
  }

  function calcSet(number) {
    const text = calcFormat(number);
    if (text === null) Object.assign(calc, { display: "0", stored: null, op: null, fresh: true, error: true, repeat: null });
    else calc.display = text;
  }

  function calcShow() {
    const text = calc.error ? "E" : calc.display;
    ui?.panels.calc?.show(text, calc.error ? "" : OP_SYMBOLS[calc.op] || "");
    controller?.setCalcDisplay(calc.error ? "E." : text.includes(".") ? text : `${text}.`);
  }

  function calcPress(action) {
    ui?.panels.calc?.flash?.(action);
    if (action === "clear" || (calc.error && /^([0-9]|point)$/.test(action))) {
      Object.assign(calc, { display: "0", stored: null, op: null, fresh: true, error: false, repeat: null });
      if (action === "clear") {
        calcShow();
        return;
      }
    }
    if (calc.error) {
      calcShow();
      return;
    }
    const value = Number(calc.display);
    if (/^[0-9]$/.test(action)) {
      if (calc.fresh) {
        calc.display = action;
        calc.fresh = false;
      } else if (calc.display.replace(/[-.]/g, "").length < CALC_DIGITS) {
        calc.display = calc.display === "0" ? action : calc.display === "-0" ? `-${action}` : calc.display + action;
      }
    } else if (action === "point") {
      if (calc.fresh) {
        calc.display = "0.";
        calc.fresh = false;
      } else if (!calc.display.includes(".")) {
        calc.display += ".";
      }
    } else if (action === "back") {
      if (!calc.fresh) {
        calc.display = calc.display.slice(0, -1);
        if (calc.display === "" || calc.display === "-") calc.display = "0";
      }
    } else if (action === "sign") {
      if (calc.display !== "0") calc.display = calc.display.startsWith("-") ? calc.display.slice(1) : `-${calc.display}`;
    } else if (action === "percent") {
      const base = (calc.op === "plus" || calc.op === "minus") && calc.stored !== null ? calc.stored : 1;
      calcSet((base * value) / 100);
      calc.fresh = true;
    } else if (OP_SYMBOLS[action]) {
      if (calc.op && !calc.fresh && calc.stored !== null) calcSet(calcApply(calc.stored, calc.op, value));
      if (!calc.error) {
        calc.stored = Number(calc.display);
        calc.op = action;
        calc.fresh = true;
        calc.repeat = null;
      }
    } else if (action === "equals") {
      if (calc.op && calc.stored !== null) {
        calc.repeat = { op: calc.op, b: value };
        calcSet(calcApply(calc.stored, calc.op, value));
        if (!calc.error) Object.assign(calc, { stored: null, op: null, fresh: true });
      } else if (calc.repeat) {
        calcSet(calcApply(value, calc.repeat.op, calc.repeat.b));
        calc.fresh = true;
      }
    }
    calcShow();
  }

  /* 实体键盘：数字、小数点、+ − × ÷（* / x）、% 、Enter / = 、Backspace、Delete / C。 */
  const CALC_KEYS = {
    ".": "point", ",": "point", "+": "plus", "-": "minus", "*": "multiply", x: "multiply", "/": "divide", ":": "divide",
    "%": "percent", "=": "equals", enter: "equals", backspace: "back", delete: "clear", c: "clear", escape: null,
  };

  function buildCalc() {
    const panel = element("aside", "room-calc");
    panel.dataset.view = "calc";
    panel.setAttribute("aria-label", T.calc.name);
    const top = element("div", "calc-top");
    const heading = element("h2", "calc-h", "HPY-80");
    heading.tabIndex = -1;
    heading.setAttribute("aria-label", T.calc.name);
    const solar = element("span", "calc-solar");
    solar.setAttribute("aria-hidden", "true");
    top.append(heading, solar);
    const screen = element("output", "calc-lcd");
    screen.setAttribute("aria-label", T.calc.display);
    screen.setAttribute("aria-live", "polite");
    const op = element("span", "calc-op");
    op.setAttribute("aria-hidden", "true");
    const value = element("span", "calc-val", "0");
    screen.append(op, value);
    const keys = element("div", "calc-keys");
    const layout = [
      ["C", "clear", "fn"], ["±", "sign", "fn"], ["%", "percent", "fn"], ["÷", "divide", "op"],
      ["7"], ["8"], ["9"], ["×", "multiply", "op"],
      ["4"], ["5"], ["6"], ["−", "minus", "op"],
      ["1"], ["2"], ["3"], ["+", "plus", "op"],
      ["0"], [".", "point"], ["⌫", "back", "fn"], ["=", "equals", "eq"],
    ];
    for (const [label, action, kind] of layout) {
      const key = element("button", kind ? `calc-key is-${kind}` : "calc-key", label);
      key.type = "button";
      key.dataset.calc = action || label;
      if (action) key.setAttribute("aria-label", T.calc[action]);
      keys.append(key);
    }
    keys.addEventListener("click", (event) => {
      const key = event.target instanceof Element ? event.target.closest("[data-calc]") : null;
      if (key) calcPress(key.dataset.calc);
    });
    panel.append(top, screen, keys);
    /* 按下的键（鼠标、手指或实体键盘）都闪一下。 */
    panel.flash = (action) => {
      const key = keys.querySelector(`[data-calc="${action}"]`);
      if (!key) return;
      key.classList.remove("is-hit");
      void key.offsetWidth;
      key.classList.add("is-hit");
    };
    panel.show = (text, symbol) => {
      value.textContent = text;
      value.classList.toggle("has-point", text.includes(".") || text === "E");
      op.textContent = symbol;
    };
    return panel;
  }

  /* ---------------------------------------------------------------- 音乐：录音机里的磁带
     每盒磁带是首页 #music 里的一首（[data-music]：歌名 [data-music-title]、时长 [data-music-length]、<audio> 的地址），
     不在脚本里写死；首页多一首，窗台上就多一盒。点哪盒就把哪盒放进录音机：
     在这次点击的调用栈里 play()，浏览器才允许出声；磁带飞进卡座的动画随后补上。 */
  const music = { tracks: [], index: -1, audio: null, state: "stopped", token: 0, note: "" };
  const MUSIC_COLORS = ["#d9583a", "#3a7bd5", "#3aa86b", "#c9a227", "#8a4fd1"];

  function collectMusic() {
    return [...document.querySelectorAll("#music [data-music]")].map((item) => {
      const audio = item.querySelector("audio");
      return {
        title: textOf(item.querySelector("[data-music-title]")),
        length: textOf(item.querySelector("[data-music-length]")),
        src: sameOrigin(audio?.querySelector("source")?.getAttribute("src") || audio?.getAttribute("src")),
      };
    }).filter((track) => track.src && track.title);
  }

  /* 书架上的作品书：首页 Work 区 Projects 分隔线之后的条目。 */
  function collectWorks() {
    const work = document.querySelector("#work");
    const split = work?.querySelector(".pb-grp");
    if (!work || !split) return [];
    return [...work.querySelectorAll(".pb-item")]
      .filter((node) => node.compareDocumentPosition(split) & Node.DOCUMENT_POSITION_PRECEDING)
      .map((node) => ({ title: textOf(node.querySelector(".pb-hd .t")) }))
      .filter((item) => item.title);
  }

  const clock = (seconds, round = false) => {
    const total = Math.max(0, round ? Math.round(seconds || 0) : Math.floor(seconds || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  function musicInfo(note) {
    if (typeof note === "string") music.note = note;
    const panel = ui?.panels.music;
    if (!panel) return;
    const audio = music.audio;
    const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0;
    panel.update({
      index: music.index,
      playing: music.state === "playing" || music.state === "loading",
      note: music.note,
      title: music.tracks[music.index]?.title || "",
      state: music.state,
      progress: duration ? (audio.currentTime || 0) / duration : 0,
      time: music.index >= 0 ? `${clock(audio?.currentTime)} / ${duration ? clock(duration, true) : music.tracks[music.index]?.length || "--:--"}` : "",
    });
  }

  function ensureAudio() {
    if (music.audio) {
      if (!music.audio.isConnected) (overlay || document.body).append(music.audio);
      return music.audio;
    }
    const audio = document.createElement("audio");
    audio.className = "room-tape-video";
    audio.preload = "none";
    audio.setAttribute("aria-hidden", "true");
    audio.addEventListener("timeupdate", () => musicInfo());
    audio.addEventListener("playing", () => {
      music.state = "playing";
      controller?.setDeckPlaying(true);
      musicInfo("");
    });
    audio.addEventListener("pause", () => {
      if (music.state === "playing" || music.state === "loading") music.state = "paused";
      controller?.setDeckPlaying(false);
      musicInfo();
    });
    audio.addEventListener("waiting", () => musicInfo(T.music.loading));
    audio.addEventListener("ended", () => {
      if (music.index + 1 < music.tracks.length) playTrack(music.index + 1);
      else stopMusic(false);
    });
    audio.addEventListener("error", () => {
      if (!audio.getAttribute("src")) return;
      music.state = "stopped";
      controller?.setDeckPlaying(false);
      musicInfo(T.music.cantPlay);
    });
    (overlay || document.body).append(audio);
    music.audio = audio;
    return audio;
  }

  function playTrack(index) {
    const track = music.tracks[index];
    if (!track) return;
    const audio = ensureAudio();
    const token = (music.token += 1);
    if (music.index !== index || !audio.getAttribute("src")) {
      audio.src = track.src;
      music.index = index;
    }
    music.state = "loading";
    musicInfo(T.music.loading);
    audio.play()?.catch?.((error) => {
      if (token !== music.token) return;
      music.state = "paused";
      controller?.setDeckPlaying(false);
      musicInfo(error?.name === "NotAllowedError" ? T.music.tapPlay : T.music.cantPlay);
    });
    controller?.insertCassette(index);
  }

  function toggleMusic() {
    if (music.index < 0 || !music.audio) {
      playTrack(0);
      return;
    }
    if (music.audio.paused) playTrack(music.index);
    else {
      music.state = "paused";
      music.audio.pause();
    }
  }

  function stepMusic(direction) {
    if (!music.tracks.length) return;
    playTrack(music.index < 0 ? 0 : (music.index + direction + music.tracks.length) % music.tracks.length);
  }

  function stopMusic(eject = true) {
    music.token += 1;
    music.state = "stopped";
    if (music.audio) {
      music.audio.pause();
      try {
        music.audio.currentTime = 0;
      } catch {
        /* 还没加载时设不了进度，忽略。 */
      }
    }
    controller?.setDeckPlaying(false);
    if (eject && music.index >= 0) {
      controller?.ejectCassette();
      music.index = -1;
      music.audio?.removeAttribute("src");
      music.audio?.load();
    }
    musicInfo("");
  }

  /* MUSIC 面板：做成磁带封套（J 卡）的样子——曲目表、正在放的这一首和进度、四个走带键。 */
  function buildMusic() {
    music.tracks = collectMusic();
    const panel = element("aside", "room-deck");
    panel.dataset.view = "music";
    panel.setAttribute("aria-label", T.nav.music);
    const head = element("div", "deck-head");
    const heading = element("h2", "deck-h", T.music.title);
    heading.tabIndex = -1;
    head.append(element("span", "deck-side", T.music.side), heading);
    const list = element("ol", "deck-list");
    music.tracks.forEach((track, index) => {
      const item = element("li");
      const button = element("button", "deck-track");
      button.type = "button";
      button.dataset.index = String(index);
      button.append(element("span", "deck-n", String(index + 1).padStart(2, "0")), element("span", "deck-t", track.title), element("span", "deck-d", track.length));
      button.addEventListener("click", () => playTrack(index));
      item.append(button);
      list.append(item);
    });
    const now = element("div", "deck-now");
    const status = element("p", "deck-status", T.music.pick);
    status.setAttribute("role", "status");
    const bar = element("div", "deck-bar");
    const fill = element("span", "deck-fill");
    bar.append(fill);
    const time = element("p", "deck-time");
    now.append(status, bar, time);
    const keys = element("div", "deck-keys");
    const keyButtons = {};
    for (const [label, action] of [["⏮︎", "prev"], ["▶︎", "play"], ["⏭︎", "next"], ["⏹︎", "stop"]]) {
      const key = element("button", `deck-key is-${action}`, label);
      key.type = "button";
      key.dataset.deck = action;
      key.setAttribute("aria-label", T.music[action]);
      keys.append(key);
      keyButtons[action] = key;
    }
    keys.addEventListener("click", (event) => {
      const key = event.target instanceof Element ? event.target.closest("[data-deck]") : null;
      if (!key) return;
      const action = key.dataset.deck;
      if (action === "prev") stepMusic(-1);
      else if (action === "next") stepMusic(1);
      else if (action === "play") toggleMusic();
      else stopMusic();
    });
    panel.append(head, list, now, keys);
    panel.update = ({ index, playing, note, title, state, progress, time: timeText }) => {
      list.querySelectorAll(".deck-track").forEach((button) => {
        if (Number(button.dataset.index) === index) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      const mark = state === "playing" ? "▶︎" : state === "paused" ? "‖" : state === "loading" ? "…" : "■︎";
      status.textContent = note || (title ? `${mark} ${title}` : T.music.pick);
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, progress)).toFixed(4)})`;
      time.textContent = timeText;
      keyButtons.play.textContent = playing ? "⏸︎" : "▶︎";
    };
    return panel;
  }

  /* ---------------------------------------------------------------- 录像带 */
  const media = { tapes: [], tape: -1, index: 0, video: null, timer: 0, paused: false, token: 0, failures: 0, feed: null, pendingTapes: false };

  function sameOrigin(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.origin === window.location.origin || /^(www\.)?hepengyuan\.com$/.test(parsed.hostname)) return parsed.pathname + parsed.search;
    } catch {
      /* 解析不了的地址直接不放。 */
    }
    return null;
  }

  /* 宣传片：取自首页 #personal-film，不在脚本里写死。 */
  function collectTapes() {
    const tapes = [];
    const film = document.querySelector("#personal-film");
    const video = film?.querySelector("video");
    const src = sameOrigin(video?.querySelector("source")?.getAttribute("src") || video?.getAttribute("src"));
    if (src) {
      /* 片名所在的那一格用 data-film-title 标出，译文页也一样；去掉粗体的「片名 / Title」前缀。 */
      const named = film.querySelector("figcaption [data-film-title]");
      const title = named ? textOf(named).slice(textOf(named.querySelector("b")).length).trim() : textOf(film.querySelector("h2"));
      tapes.push({ id: "promo", label: T.tapes.promo, en: "PROMO", color: "#d9583a", items: [{ kind: "video", src, poster: sameOrigin(video.getAttribute("poster")), title }] });
    }
    return tapes;
  }

  /* 旅行与学习影像：只来自 /api/media.json（服务端只返回已发布条目）。 */
  function loadArchiveTapes() {
    if (media.feed) return media.feed;
    media.feed = fetch("/api/media.json", { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((feed) => {
        const items = Array.isArray(feed?.items) ? feed.items : [];
        for (const archive of ARCHIVES) {
          const list = items
            .filter((item) => item?.category === archive.category && (item.mediaType === "video" || item.mediaType === "image"))
            .map((item) => ({ kind: item.mediaType, src: sameOrigin(item.contentUrl), poster: sameOrigin(item.thumbnailUrl), title: String(item.title || "").trim() }))
            .filter((item) => item.src);
          if (list.length) media.tapes.push({ id: archive.category, label: archive.label, en: archive.en, color: archive.color, items: list });
        }
        syncTapes();
      })
      .catch(() => {
        /* 影像档案拿不到时，只有宣传片这一盒带。 */
      });
    return media.feed;
  }

  function syncTapes() {
    if (!controller) return;
    /* 正在放的带子在录像机里，换掉整摞带子会把它弄丢：等退带之后再同步。 */
    if (media.tape >= 0) {
      media.pendingTapes = true;
      return;
    }
    media.pendingTapes = false;
    controller.setTapes(media.tapes.map((tape) => ({ label: tape.label, en: tape.en, color: tape.color })));
  }

  function filmInfo(status) {
    const tape = media.tapes[media.tape];
    const panel = ui?.panels.film;
    if (!tape || !panel) return;
    const item = tape.items[media.index];
    const counter = `${String(media.index + 1).padStart(2, "0")}/${String(tape.items.length).padStart(2, "0")}`;
    panel.setInfo(`${tape.label} ${tape.en} · ${counter}`, item?.title || "", status || "");
    if (ui.play) {
      ui.play.textContent = media.paused ? T.buttons.play : T.buttons.pause;
      ui.play.classList.toggle("is-paused", media.paused);
      ui.play.setAttribute("aria-label", media.paused ? T.play : T.pause);
    }
    return counter;
  }

  /* 录像带的 <video> 必须挂在页面里（视觉上隐藏，但不能 display:none）：
     有些 iPhone 版本不会为脱离文档的视频解码画面，电视上就只剩黑屏或雪花。
     playsinline / webkit-playsinline / x5-* 让 iPhone 和微信内置浏览器在页面里播放，不跳全屏播放器。 */
  function ensureVideo() {
    const host = overlay || document.body;
    if (media.video) {
      if (!media.video.isConnected) host.append(media.video);
      return media.video;
    }
    const video = document.createElement("video");
    video.className = "room-tape-video";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("x5-playsinline", "");
    video.setAttribute("x5-video-player-type", "h5-page");
    video.setAttribute("aria-hidden", "true");
    video.tabIndex = -1;
    video.preload = "auto";
    video.addEventListener("ended", () => step(1));
    video.addEventListener("waiting", () => {
      if (media.tape >= 0 && !media.paused && video.getAttribute("src")) filmInfo("BUFFERING");
    });
    video.addEventListener("playing", () => {
      if (media.tape >= 0) filmInfo("");
    });
    video.addEventListener("error", () => {
      if (media.tape < 0 || !video.getAttribute("src")) return;
      media.failures += 1;
      controller?.tv({ mode: "noise" });
      /* 最常见的原因是编码：例如 HEVC（H.265）视频在不少安卓手机和微信里解不出来。 */
      filmInfo(`NO SIGNAL\n${T.filmCantPlay}`);
      const tape = media.tapes[media.tape];
      if (tape && media.failures < tape.items.length) media.timer = window.setTimeout(() => step(1), 2400);
    });
    host.append(video);
    media.video = video;
    return video;
  }

  /* 视频还没出画面时，先把封面放到电视上，比一直下雪花更像「正在加载」。 */
  function showPoster(item, token, osd) {
    if (!item.poster) return;
    const request = (media.posterRequest = (media.posterRequest || 0) + 1);
    const poster = new Image();
    poster.decoding = "async";
    poster.addEventListener("load", () => {
      /* 只认最后一次请求：先发的「LOADING」不能盖掉后来的「PAUSE」。 */
      if (token !== media.token || media.showing || request !== media.posterRequest) return;
      controller?.tv({ mode: "media", element: poster, osd, osdHold: true });
    }, { once: true });
    poster.src = item.poster;
  }

  function clearItem() {
    media.token += 1;
    window.clearTimeout(media.timer);
    if (media.video) {
      media.video.pause();
      media.video.removeAttribute("src");
      media.video.removeAttribute("poster");
      media.video.load();
    }
  }

  /* 放某一段。视频在用户点击的同一个调用栈里 play()，浏览器才允许带声音播放。 */
  function playItem(index) {
    const tape = media.tapes[media.tape];
    if (!tape || !controller) return;
    clearItem();
    const token = media.token;
    media.index = (index + tape.items.length) % tape.items.length;
    media.paused = false;
    media.showing = false;
    const item = tape.items[media.index];
    controller.tv({ mode: "noise" });
    controller.setVcr("play");
    const counter = filmInfo("LOADING");

    if (item.kind === "video") {
      const video = ensureVideo();
      if (item.poster) video.poster = item.poster;
      video.src = item.src;
      const show = () => {
        if (token !== media.token) return;
        media.failures = 0;
        media.showing = true;
        controller?.tv({ mode: "media", element: video, osd: `\u25B6 PLAY ${counter}`, osdHold: false });
        filmInfo("");
      };
      video.addEventListener("playing", show, { once: true });
      showPoster(item, token, "LOADING");
      const attempt = video.play();
      attempt?.catch?.((error) => {
        /* 只有「不允许播放」才提示去点画面；解码失败（例如 HEVC）、地址失效由 error 事件显示 NO SIGNAL，
           换段时被打断的 AbortError 直接忽略。 */
        if (token !== media.token || error?.name !== "NotAllowedError") return;
        /* 浏览器没让自动播：立刻提示「点画面播放」。不能等 loadeddata，
           iPhone 在真正开始播放之前根本不会加载视频数据。 */
        media.paused = true;
        controller?.setVcr("pause");
        filmInfo(T.filmTapPlay);
        showPoster(item, token, `\u2016 PAUSE ${counter}`);
      });
      return;
    }

    if (media.video) media.video.pause();
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
      if (token !== media.token) return;
      media.failures = 0;
      controller?.tv({ mode: "media", element: image, osd: `\u25B6 PLAY ${counter}`, osdHold: false });
      filmInfo("");
      if (!media.paused) media.timer = window.setTimeout(() => step(1), IMAGE_SECONDS * 1000);
    }, { once: true });
    image.addEventListener("error", () => {
      if (token !== media.token) return;
      media.failures += 1;
      filmInfo("NO SIGNAL");
      if (media.failures < tape.items.length) media.timer = window.setTimeout(() => step(1), 1600);
    }, { once: true });
    image.src = item.src;
  }

  function step(direction) {
    if (media.tape < 0) return;
    playItem(media.index + direction);
  }

  function togglePause() {
    if (media.tape < 0 || !controller) return;
    const tape = media.tapes[media.tape];
    const item = tape?.items[media.index];
    if (!item) return;
    media.paused = !media.paused;
    const counter = `${String(media.index + 1).padStart(2, "0")}/${String(tape.items.length).padStart(2, "0")}`;
    if (item.kind === "video" && media.video) {
      if (media.paused) {
        media.video.pause();
      } else {
        const token = media.token;
        /* 用户这次点击就是播放许可：画面出来之后再切到视频。 */
        if (!media.showing) {
          media.video.addEventListener("playing", () => {
            if (token !== media.token) return;
            media.showing = true;
            controller?.tv({ mode: "media", element: media.video, osd: `\u25B6 PLAY ${counter}`, osdHold: false });
            filmInfo("");
          }, { once: true });
        }
        media.video.play()?.catch?.((error) => {
          if (token !== media.token || error?.name !== "NotAllowedError") return;
          media.paused = true;
          controller?.setVcr("pause");
          filmInfo(T.filmTapPlay);
        });
      }
    } else {
      window.clearTimeout(media.timer);
      if (!media.paused) media.timer = window.setTimeout(() => step(1), IMAGE_SECONDS * 1000);
    }
    controller.setVcr(media.paused ? "pause" : "play");
    if (controller && item.kind === "video" && media.video && media.showing) {
      controller.tv({ mode: "media", element: media.video, osd: `${media.paused ? "\u2016 PAUSE" : "\u25B6 PLAY"} ${counter}`, osdHold: media.paused });
    }
    filmInfo(media.paused ? T.buttons.pause : "");
  }

  /* 换带：同步开始播放（保住点击带来的播放许可），带子的动画随后补上。 */
  function startTape(index) {
    if (!media.tapes[index] || !controller) return;
    const previous = controller.loadedTape;
    media.tape = index;
    media.failures = 0;
    playItem(0);
    const swap = previous >= 0 && previous !== index ? controller.ejectTape() : Promise.resolve();
    swap.then(() => (controller?.loadedTape === index ? null : controller?.insertTape(index)));
  }

  function stopMedia() {
    if (media.tape < 0) return;
    clearItem();
    media.tape = -1;
    media.paused = false;
    if (!controller) return;
    controller.tv({ mode: "idle" });
    controller.setVcr("clock");
    controller.ejectTape().then(() => {
      if (media.pendingTapes) syncTapes();
    });
  }

  /* ---------------------------------------------------------------- 雨声：WebAudio 现场合成，不加载音频文件 */
  const sound = { context: null, gain: null, on: false };

  function setSound(on) {
    sound.on = on;
    try {
      if (on && !sound.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const context = new AudioContext();
        const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
        const data = buffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < data.length; i += 1) {
          brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          data[i] = brown * 3.2 + (Math.random() * 2 - 1) * 0.18;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const low = context.createBiquadFilter();
        low.type = "lowpass";
        low.frequency.value = 1600;
        const high = context.createBiquadFilter();
        high.type = "highpass";
        high.frequency.value = 180;
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(high).connect(low).connect(gain).connect(context.destination);
        source.start();
        sound.context = context;
        sound.gain = gain;
      }
      if (!sound.context) return;
      const now = sound.context.currentTime;
      if (on) sound.context.resume();
      sound.gain.gain.cancelScheduledValues(now);
      sound.gain.gain.setTargetAtTime(on ? 0.22 : 0, now, 0.4);
      if (!on) window.setTimeout(() => !sound.on && sound.context?.suspend(), 1600);
    } catch {
      sound.on = false;
    }
  }

  function toggleSound(force) {
    setSound(typeof force === "boolean" ? force : !sound.on);
    if (ui?.sound) {
      ui.sound.textContent = sound.on ? T.buttons.soundOn : T.buttons.soundOff;
      ui.sound.setAttribute("aria-pressed", String(sound.on));
    }
  }

  /* ---------------------------------------------------------------- 遮罩层 */
  let overlay = null;
  let stage = null;
  let ui = null;
  let controller = null;
  let state = "idle"; /* idle → opening → open → closing → idle */
  let view = "desk";
  let capability = null;
  let unLayout = null;

  function ensureOverlay() {
    if (overlay) {
      overlay.hidden = false;
      return overlay;
    }
    overlay = element("div", "room");
    overlay.id = "room";
    overlay.tabIndex = -1;
    overlay.setAttribute("role", "region");
    overlay.setAttribute("aria-label", T.overlay);

    stage = element("div", "room-stage");

    const hud = element("header", "room-hud");
    const name = element("p", "room-name");
    name.append(element("span", "cn", "何鹏远"), element("span", "en", "HE PENGYUAN"));
    const nav = element("nav", "room-nav");
    nav.setAttribute("aria-label", T.roomNav);
    const navButtons = {};
    for (const item of NAV) {
      const button = element("button", "room-nav-b", item.label);
      button.type = "button";
      button.setAttribute("aria-label", `${item.label} · ${item.sub}`);
      button.addEventListener("click", () => (view === item.view ? openView("desk") : openView(item.view)));
      navButtons[item.view] = button;
      nav.append(button);
    }
    const services = element("a", "room-nav-b room-nav-ext", T.menu.services);
    services.href = "/services/";
    services.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      session.set(SEEN_KEY, "1");
    });
    nav.append(services);

    /* 语言菜单：换到对应语言的首页，并直接进房间。 */
    const tools = element("div", "room-tools");
    const langMenu = element("details", "room-lang");
    const langSummary = element("summary", "room-nav-b", LANG_PAGES.find((page) => page.lang === LANG).short);
    langSummary.setAttribute("aria-label", T.language);
    const langList = element("ul", "room-lang-list");
    for (const page of LANG_PAGES) {
      const item = element("li");
      const link = element("a", "room-lang-a", page.label);
      link.href = `${page.path}?room=1`;
      link.lang = page.lang === "zh" ? "zh-CN" : page.lang;
      link.hreflang = link.lang;
      if (page.lang === LANG) link.setAttribute("aria-current", "page");
      item.append(link);
      langList.append(item);
    }
    langMenu.append(langSummary, langList);
    tools.append(langMenu);
    hud.append(name, nav, tools);

    const panels = {
      about: buildAbout(),
      posts: buildPosts(),
      film: buildFilm(),
      online: buildOnline(),
      work: buildWork(),
      calc: buildCalc(),
      music: buildMusic(),
    };
    for (const panel of Object.values(panels)) {
      panel.hidden = true;
      panel.inert = true;
    }

    const tip = element("p", "room-tip");
    tip.setAttribute("aria-hidden", "true");

    const dock = element("div", "room-dock");
    const keys = element("p", "room-keys", DESK_HINT);
    const buttons = element("div", "room-btns");
    const back = element("button", "room-btn room-back", backLabel("desk"));
    back.type = "button";
    back.hidden = true;
    back.setAttribute("aria-label", T.back);
    back.addEventListener("click", () => openView("desk"));
    const play = element("button", "room-btn room-play", T.buttons.pause);
    play.type = "button";
    play.hidden = true;
    play.addEventListener("click", () => togglePause());
    const next = element("button", "room-btn room-next", T.buttons.next);
    next.type = "button";
    next.hidden = true;
    next.setAttribute("aria-label", T.next);
    next.addEventListener("click", () => step(1));
    const credits = element("button", "room-btn room-credits-b", T.buttons.credits);
    credits.type = "button";
    credits.setAttribute("aria-expanded", "false");
    const soundButton = element("button", "room-btn room-sound", T.buttons.soundOff);
    soundButton.type = "button";
    soundButton.setAttribute("aria-pressed", "false");
    soundButton.setAttribute("aria-label", T.sound);
    soundButton.addEventListener("click", () => toggleSound());
    const viewButton = element("button", "room-btn room-view", T.buttons.view);
    viewButton.type = "button";
    viewButton.setAttribute("aria-label", T.music.view);
    viewButton.addEventListener("click", () => {
      if (view !== "desk") openView("desk");
      else controller?.cycleDeskView();
    });
    const lofi = element("button", "room-btn room-lofi", T.buttons.lofi);
    lofi.type = "button";
    lofi.title = T.lofi;
    lofi.setAttribute("aria-label", `${T.buttons.lofi}: ${T.lofi}`);
    lofi.addEventListener("click", () => leave({ target: "#top", persist: true }));
    buttons.append(back, play, next, credits, viewButton, soundButton, lofi);
    dock.append(keys, buttons);
    /* 窄屏照 Felix 手机版：声音和静态版挪到顶部右侧；宽屏放回右下角那一排。 */
    const narrow = window.matchMedia ? window.matchMedia("(max-width: 719px)") : null;
    const placeTools = () => {
      if (narrow?.matches) tools.prepend(viewButton, soundButton, lofi);
      else buttons.append(viewButton, soundButton, lofi);
    };
    placeTools();
    narrow?.addEventListener?.("change", placeTools);

    const creditsPanel = element("div", "room-credits");
    creditsPanel.hidden = true;
    creditsPanel.setAttribute("role", "dialog");
    creditsPanel.setAttribute("aria-label", "Credits");
    T.credits.forEach(([key, value]) => {
      const row = element("p", "rc-row");
      row.append(element("b", "", key), element("span", "", value));
      creditsPanel.append(row);
    });
    credits.addEventListener("click", () => {
      creditsPanel.hidden = !creditsPanel.hidden;
      credits.setAttribute("aria-expanded", String(!creditsPanel.hidden));
    });

    const status = element("p", "room-status", T.loading);
    status.setAttribute("role", "status");

    overlay.append(stage, ...Object.values(panels), hud, tip, creditsPanel, dock, status);
    overlay.addEventListener("keydown", onKey);
    document.body.append(overlay);
    ui = {
      navButtons, panels, tip, keys, back, play, next, sound: soundButton, credits, creditsPanel,
      unbind: () => narrow?.removeEventListener?.("change", placeTools),
    };
    calcShow();
    return overlay;
  }

  /* 房间打开时，底下的静态页不能被 Tab 到，也不该被读屏读到。 */
  function setBackgroundInert(inert) {
    for (const node of document.body.children) {
      if (node === overlay || node.tagName === "SCRIPT") continue;
      node.inert = inert;
      if (inert) node.setAttribute("aria-hidden", "true");
      else node.removeAttribute("aria-hidden");
    }
  }

  /* ---------------------------------------------------------------- 视图 */
  function placePanel(id) {
    const panel = ui?.panels[id];
    if (!panel || !controller || FLOATING.has(id)) return;
    const rect = controller.screenRect(id);
    const stageWidth = stage.clientWidth;
    /* 太窄时，按物件真实大小投影出来的屏幕读不清：改成铺满中间的固定面板。 */
    const minWidth = Math.min(420, stageWidth * 0.62);
    /* 录像带的字幕层必须贴着电视屏幕，不能改成铺满的面板。 */
    const fixed = id !== "film" && (!rect || rect.width < minWidth || stageWidth < 720);
    panel.classList.toggle("is-fixed", fixed);
    if (fixed) {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.width = "";
      panel.style.height = "";
      return;
    }
    panel.style.left = `${rect.left.toFixed(1)}px`;
    panel.style.top = `${rect.top.toFixed(1)}px`;
    panel.style.width = `${rect.width.toFixed(1)}px`;
    panel.style.height = `${rect.height.toFixed(1)}px`;
  }

  function closePanels() {
    if (!ui) return;
    for (const panel of Object.values(ui.panels)) {
      panel.classList.remove("is-open");
      panel.inert = true;
      panel.hidden = true;
    }
  }

  let viewToken = 0;
  async function openView(next, { fromHistory = false, tape = null } = {}) {
    if (state !== "open" || !controller) return;
    if (next === view) {
      if (next === "film" && Number.isInteger(tape) && tape !== media.tape) startTape(tape);
      return;
    }
    const previous = view;
    view = next;
    const token = (viewToken += 1);
    if (previous === "film") stopMedia();
    if (next === "film") startTape(Number.isInteger(tape) ? tape : 0);

    closePanels();
    ui.creditsPanel.hidden = true;
    ui.credits.setAttribute("aria-expanded", "false");
    for (const [id, button] of Object.entries(ui.navButtons)) {
      if (id === next) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    ui.keys.textContent = next === "desk" ? DESK_HINT : HINTS[next] || "";
    ui.back.hidden = next === "desk";
    ui.back.textContent = backLabel(next);
    ui.play.hidden = next !== "film";
    ui.next.hidden = next !== "film";

    /* 进入某个视图时压一条历史记录，手机上的返回手势就会回到桌面而不是离开网站。 */
    if (!fromHistory) {
      try {
        if (next !== "desk" && previous === "desk") window.history.pushState({ hpyRoom: next }, "");
        else if (next !== "desk") window.history.replaceState({ hpyRoom: next }, "");
        else if (window.history.state?.hpyRoom) window.history.back();
      } catch {
        /* 历史记录不可用就只靠 Esc 和按钮。 */
      }
    }

    const panel = ui.panels[next];
    if (panel && FLOATING.has(next)) {
      /* 记事本和计算器不用等镜头：和镜头一起升起来。 */
      panel.hidden = false;
      panel.inert = false;
      requestAnimationFrame(() => panel.classList.add("is-open"));
    }
    await controller.goTo(next);
    if (token !== viewToken || state !== "open") return;

    if (panel && !FLOATING.has(next)) {
      panel.updateClock?.();
      placePanel(next);
      panel.hidden = false;
      panel.inert = false;
      requestAnimationFrame(() => panel.classList.add("is-open"));
    }
    if (panel) panel.querySelector("h2")?.focus({ preventScroll: true });
    else overlay.focus({ preventScroll: true });
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (!ui.creditsPanel.hidden) {
        ui.creditsPanel.hidden = true;
        ui.credits.setAttribute("aria-expanded", "false");
        ui.credits.focus();
      } else if (view !== "desk") {
        openView("desk");
      }
      event.preventDefault();
      return;
    }
    if (view === "calc" && key in CALC_KEYS && CALC_KEYS[key]) {
      /* 焦点在计算器按键上时，Enter / 空格交给按键本身。 */
      if (key === "enter" && event.target instanceof Element && event.target.closest(".calc-key")) return;
      calcPress(CALC_KEYS[key]);
      event.preventDefault();
      return;
    }
    if (view === "calc" && /^[0-9]$/.test(key)) {
      calcPress(key);
      event.preventDefault();
      return;
    }
    /* 焦点在面板按钮上时，空格和 Enter 交给按钮本身。 */
    const onButton = event.target instanceof Element && Boolean(event.target.closest("button"));
    if (view === "music" && !(onButton && (key === " " || key === "enter"))) {
      let handled = true;
      if (key === " " || key === "spacebar") toggleMusic();
      else if (key === "arrowright") stepMusic(1);
      else if (key === "arrowleft") stepMusic(-1);
      else if (key === "s") stopMusic();
      else if (/^[1-9]$/.test(key) && music.tracks[Number(key) - 1]) playTrack(Number(key) - 1);
      else handled = false;
      if (handled) {
        event.preventDefault();
        return;
      }
    }
    if (view === "desk" && key === "v") {
      controller?.cycleDeskView();
      event.preventDefault();
      return;
    }
    if (view === "desk" && key === "c") {
      openView("calc");
      event.preventDefault();
      return;
    }
    if (view === "desk" && controller) {
      const nudges = {
        arrowleft: { yaw: 0.12 }, arrowright: { yaw: -0.12 }, arrowup: { pitch: 0.08 }, arrowdown: { pitch: -0.08 },
        "+": { zoom: 0.88 }, "=": { zoom: 0.88 }, "-": { zoom: 1.14 },
      };
      if (nudges[key]) {
        controller.nudge(nudges[key]);
        event.preventDefault();
        return;
      }
      if (key === "0") {
        controller.resetOrbit();
        event.preventDefault();
        return;
      }
    }
    const nav = NAV.find((item) => item.key === key);
    if (nav) {
      openView(view === nav.view ? "desk" : nav.view);
      event.preventDefault();
      return;
    }
    if (key === "l" && view === "desk") {
      controller?.toggleLamp();
      return;
    }
    if (view === "film") {
      if (key === " " || key === "spacebar") togglePause();
      else if (key === "arrowright") step(1);
      else if (key === "arrowleft") step(-1);
      else if (/^[1-4]$/.test(key)) openView("film", { tape: Number(key) - 1 });
      else return;
      event.preventDefault();
      return;
    }
    if (view === "about" && /^[1-5]$/.test(key)) {
      openView(FKEYS[Number(key) - 1]);
      event.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(key) && (view === "posts" || view === "online")) {
      const target = ui.panels[view].querySelector(`[data-key="${key}"]`);
      if (target) {
        target.click();
        event.preventDefault();
      }
    }
  }

  function onPick(id, detail = {}) {
    if (id === "tape") {
      openView("music");
      return;
    }
    if (id === "cassette") {
      /* 先在这次点击里开始放，再把镜头推过去。 */
      playTrack(Number(detail.value) || 0);
      openView("music");
      return;
    }
    if (id === "book") {
      openView("work");
      return;
    }
    if (id.startsWith("deck")) {
      if (id === "deckPlay") toggleMusic();
      else if (id === "deckPause") {
        if (music.audio && !music.audio.paused) toggleMusic();
      } else if (id === "deckStop") stopMusic();
      else if (id === "deckNext") stepMusic(1);
      else if (id === "deckPrev") stepMusic(-1);
      return;
    }
    if (id === "calc") {
      openView("calc");
      return;
    }
    if (NAV.some((item) => item.view === id)) {
      openView(id, { tape: detail.tape });
      return;
    }
    const href = LEAVE_LINKS[id];
    if (!href) return;
    if (href.startsWith("#")) {
      leave({ target: href, persist: false });
      return;
    }
    session.set(SEEN_KEY, "1");
    window.location.assign(href);
  }

  function onHover(info) {
    const tip = ui?.tip;
    if (!tip) return;
    if (!info) {
      tip.classList.remove("is-on");
      return;
    }
    tip.replaceChildren(element("span", "room-tip-l", `${info.label} · ${info.sub}${info.external ? " ↗" : ""}`));
    tip.classList.toggle("is-confirm", Boolean(info.confirm));
    if (info.confirm) tip.append(element("span", "room-tip-again", T.tapAgain));
    const bounds = overlay.getBoundingClientRect();
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    let x = info.confirm ? info.x - tipWidth / 2 : info.x + 16;
    let y = info.confirm ? info.y - tipHeight - 18 : info.y + 18;
    x = Math.max(8, Math.min(x, bounds.width - tipWidth - 8));
    if (y < 56) y = info.y + 22;
    y = Math.min(y, bounds.height - tipHeight - 8);
    tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    tip.classList.add("is-on");
  }

  function onPopState() {
    if (state !== "open") return;
    const target = window.history.state?.hpyRoom;
    openView(target && target !== view ? target : "desk", { fromHistory: true });
  }

  /* ---------------------------------------------------------------- 进出房间 */
  function teardown() {
    unLayout?.();
    unLayout = null;
    clearItem();
    media.tape = -1;
    controller?.dispose();
    controller = null;
    setSound(false);
    music.token += 1;
    music.audio?.pause();
    music.audio?.removeAttribute("src");
    music.index = -1;
    music.state = "stopped";
    ui?.unbind?.();
    overlay?.remove();
    overlay = null;
    stage = null;
    ui = null;
    view = "desk";
    setBackgroundInert(false);
    root.removeAttribute("data-room");
    state = "idle";
  }

  /* 加载失败、运行太慢、上下文丢失：统一退回静态版并说明原因。 */
  function fail(reason) {
    teardown();
    session.set(SEEN_KEY, "1");
    if (reason === "slow") local.set(PREF_KEY, "auto-off");
    const canRetry = reason !== "no-webgl" && Boolean(capability?.webgl);
    showPills(canRetry);
    showNotice(reason, canRetry);
  }

  async function open({ forced }) {
    if (state !== "idle") return;
    state = "opening";
    hideNotice();
    showPills(false);
    root.setAttribute("data-room", "loading");
    ensureOverlay();
    setBackgroundInert(true);
    overlay.focus({ preventScroll: true });

    if (controller) {
      controller.reset();
      controller.start();
      root.setAttribute("data-room", "on");
      state = "open";
      return;
    }

    let timer = 0;
    try {
      const timeout = new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("room: load timeout")), LOAD_TIMEOUT_MS);
      });
      const module = await Promise.race([import(SCENE_URL), timeout]);
      if (state !== "opening") return;
      const mounted = await Promise.race([
        module.mount({
          stage,
          quality: capability?.quality || "high",
          forced,
          reducedMotion: matches("(prefers-reduced-motion: reduce)"),
          posterUrl: POSTER_URL,
          labels: { hotspots: T.hotspots, tvInsert: T.tvInsert },
          onHover,
          onPick,
          onFail: fail,
        }),
        timeout,
      ]);
      if (state !== "opening") {
        mounted.dispose();
        return;
      }
      controller = mounted;
      unLayout = controller.onLayout(() => {
        if (view !== "desk" && !FLOATING.has(view)) placePanel(view);
      });
      if (!media.tapes.length) media.tapes = collectTapes();
      syncTapes();
      controller.setCassettes(music.tracks.map((track, index) => ({ label: T.tapes.music, en: "MUSIC", color: MUSIC_COLORS[index % MUSIC_COLORS.length] })));
      controller.setBooks(collectWorks());
      musicInfo("");
      loadArchiveTapes();
    } catch {
      if (state === "opening") fail("load-failed");
      return;
    } finally {
      window.clearTimeout(timer);
    }

    controller.start();
    root.setAttribute("data-room", "on");
    state = "open";
  }

  function leave({ target, persist }) {
    if (state !== "open" && state !== "opening") return;
    const wasOpening = state === "opening";
    state = "closing";
    if (persist) local.set(PREF_KEY, "off");
    session.set(SEEN_KEY, "1");
    if (view === "film") stopMedia();
    toggleSound(false);
    stopMusic(false);
    closePanels();

    setBackgroundInert(false);
    root.setAttribute("data-room", "leaving");

    const section = target && target !== "#top" ? document.querySelector(target) : null;
    if (section) section.scrollIntoView({ block: "start", behavior: "instant" });
    else window.scrollTo(0, 0);
    try {
      window.history.replaceState(null, "", section ? target : window.location.pathname + window.location.search);
    } catch {
      /* 地址栏不更新也没关系。 */
    }
    const focusTarget = section || document.querySelector("#top");
    if (focusTarget) {
      if (!focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1");
      focusTarget.focus({ preventScroll: true });
    }

    window.setTimeout(() => {
      if (wasOpening) {
        /* 还在加载就点了跳过：整层拆掉，晚到的场景会被 open() 里的状态检查丢弃。 */
        teardown();
      } else {
        controller?.stop();
        controller?.reset();
        view = "desk";
        if (ui) {
          for (const button of Object.values(ui.navButtons)) button.removeAttribute("aria-current");
          ui.keys.textContent = DESK_HINT;
          ui.back.hidden = true;
          ui.play.hidden = true;
          ui.next.hidden = true;
          ui.creditsPanel.hidden = true;
        }
        if (overlay) overlay.hidden = true;
        root.removeAttribute("data-room");
        state = "idle";
      }
      showPills(Boolean(capability?.webgl));
    }, FADE_MS);
  }

  /* ---------------------------------------------------------------- 启动 */
  function init() {
    const query = new URLSearchParams(window.location.search);
    const forced = query.get("room") === "1";
    const declined = query.get("room") === "0" || query.has("static");

    if (forced) {
      local.remove(PREF_KEY);
      session.remove(SEEN_KEY);
    }
    if (declined) local.set(PREF_KEY, "off");
    if (forced || declined) cleanUrl();

    capability = probe();

    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest(`a[href="${HOME}?room=1"]`) : null;
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!capability.webgl) return;
      event.preventDefault();
      local.remove(PREF_KEY);
      open({ forced: true });
    });

    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", (event) => {
      if (!event.persisted || !controller || state !== "open") return;
      controller.reset();
      if (media.tape >= 0) stopMedia();
      view = "desk";
      closePanels();
      controller.start();
    });
    window.addEventListener("pagehide", () => {
      controller?.stop();
      if (view === "film") stopMedia();
      toggleSound(false);
      if (music.audio && !music.audio.paused) music.audio.pause();
    });

    const preference = local.get(PREF_KEY);
    /* declined 单独判断：隐私模式下 localStorage 写不进去，不能只靠刚才存的偏好。 */
    const wantsRoom = forced || (
      !declined
      && preference !== "off"
      && preference !== "auto-off"
      && session.get(SEEN_KEY) !== "1"
      && window.location.hash.length <= 1
      && !AUTOMATED
    );

    if (wantsRoom && (capability.ok || (forced && capability.webgl))) {
      open({ forced });
      return;
    }

    root.removeAttribute("data-room");
    showPills(capability.webgl);
    if (wantsRoom) showNotice(capability.reason, capability.webgl);
    else if (preference === "auto-off") showNotice("slow", capability.webgl);
  }

  try {
    init();
  } catch {
    root.removeAttribute("data-room");
  }
})();
