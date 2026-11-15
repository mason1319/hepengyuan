/* 何鹏远个人网站 —— 3D 房间里的小人：Q 版何鹏远，御剑飞行

   房间亮起来之后由 /room/boot.js 按需加载，不拖慢进房间；加载失败就没有小人，房间其余部分不受影响。
   这个模块做两件事：
   1. createActor：纯程序化建模的小人和飞剑（白色唐装、黑发、眼镜，照本人形象照设计），以及它的动作——
      踩剑飞行、在桌面上跑和跳、落到电脑 / 电视 / 录音机顶上、被拎着走。
   2. start：气泡、台词、带逛（按顺序介绍房间里的物件）和本人录音的播放。

   约束：
   - 没有 import：three.js 由 scene.js 通过 host 交进来，保证是同一份。
   - 台词只有招呼、玩笑和对房间物件的说明，不写任何履历事实；平时不说脏话，被连戳或被拎起来才爆粗口。
   - 说话的声音只能是何鹏远本人的录音（assets/room/voice/），没有录音的台词只出文字气泡，不用机器合成。
   - 样式在 styles.css 的「hi-fi 房间」一节；位置用 CSSOM 写（站点 CSP 是 style-src 'self'）。 */

const TAU = Math.PI * 2;
const HI_KEY = "hpy-room-hi"; /* 本次会话已经打过招呼 */
const MUTE_KEY = "hpy-room-mute"; /* 本次会话里访客把小人静音了 */

/* 本人录音：文件是 VOICE_DIR + 台词 id + ".mp3"。录好一句就把 id 加进 VOICE；不在这里的台词只出文字。
   录的是普通话，四种语言的页面都播这一份，气泡里的译文当字幕。重录某一句后把 VOICE_REV 加一，
   否则访客浏览器会继续用缓存里的旧录音（/assets/ 缓存七天）。 */
const VOICE_DIR = "/assets/room/voice/";
const VOICE_REV = "1";
const VOICE = new Set([
  "hello",
  "greet1", "greet2", "greet3", "greet4", "greet5", "greet6", "greet7", "greet8",
  "swear1", "swear2", "swear3", "swear4",
  "grab1", "grab2", "grab3",
  "drop1", "drop2", "drop3",
  "tourStart", "tourEnd", "tourStop",
  "stop-about", "stop-photos", "stop-shelf", "stop-game", "stop-work",
  "stop-tv", "stop-calc", "stop-card", "stop-online", "stop-music",
]);

const STRINGS = {
  zh: {
    ui: { tour: "带我逛逛", next: "下一个", stop: "不逛了", open: "打开看看", mute: "静音", unmute: "开声音" },
    hello: "嗨！我是迷你版何鹏远，正在御剑巡房。点我说话，拖我也行。",
    greet: [
      "别戳啦，我在御剑飞行，驾照还没考下来。",
      "欢迎光临！这屋里的东西都能点，别客气。",
      "你好呀，我是迷你版何鹏远，本体这会儿在忙。",
      "这把剑不烧油不充电，绿色出行。",
      "外面在下雨，屋里正好听歌、看片、算账。",
      "悄悄说：按 V 可以换视角。手机上点右上角那个圆圈。",
      "想让我带路？点下面的「带我逛逛」。",
      "我飞得稳不稳？给个好评呗。",
    ],
    swear: [
      "卧槽，别戳了！再戳我真从剑上掉下去了。",
      "我靠，你戳上瘾了是吧？",
      "妈的，御剑呢，严肃点！",
      "行行行，你牛逼，你接着戳。",
    ],
    grab: ["哎哎哎——放我下来！", "卧槽，谁拎我？！", "轻点轻点，我恐高！"],
    drop: ["……行吧，这儿风景也不错。", "下次拎之前打个招呼，谢谢。", "还好我会御剑，摔不着。"],
    tourStart: "坐稳了，发车！带你把这屋逛一圈。",
    tourEnd: "逛完啦！剩下的随便点，我接着飞。",
    tourStop: "好嘞，你自己逛，有事戳我。",
    stops: {
      about: "这台老电脑是「关于」。点它，屏幕上就是我的介绍。",
      photos: "显示器上贴的拍立得是我本人。墙上和桌上的相框，是我的老照片。",
      shelf: "书架上摆着我的作品，还有八卦镜、金蟾和符箓——保平安，也保佑别出 bug。",
      game: "这台掌机通往 Aggie 3A 互动演示，点它就出发。",
      work: "黄色记事本上是我的履历和作品，点一下翻开。",
      tv: "这台大彩电：图文电视看文章，放进录像带看宣传片。面板上的按键都能按。",
      calc: "计算器不是摆设，拿起来真的能算。不信你按个 1+1。",
      card: "名片盒里是我的名片，抽一张，还能翻面。",
      online: "电话和调制解调器管「联系」和「服务」。拨号上网，够复古吧。",
      music: "录音机里的磁带是我写的歌，点一下就放。",
    },
  },
  en: {
    ui: { tour: "Show me around", next: "Next", stop: "Stop", open: "Open it", mute: "Mute", unmute: "Sound on" },
    hello: "Hi! I'm mini He Pengyuan, patrolling the room on a flying sword. Tap me to chat, or drag me around.",
    greet: [
      "Stop poking, I'm flying a sword here and I don't have a licence yet.",
      "Welcome! Everything in this room is clickable. Help yourself.",
      "Hello! I'm the mini He Pengyuan. The full-size one is busy right now.",
      "This sword needs no fuel and no charger. Very green.",
      "It's raining outside. Perfect for music, a film, or some maths.",
      "Psst: press V to change the view. On a phone, tap the round button up top.",
      "Want a guide? Tap “Show me around” below.",
      "Smooth flying, right? Five stars, please.",
    ],
    swear: [
      "Holy crap, stop poking! I'm going to fall off this damn sword.",
      "Bloody hell, you're really enjoying this, aren't you?",
      "Damn it, I'm flying a sword here. A little respect!",
      "Fine, fine. You're the boss. Keep poking.",
    ],
    grab: ["Hey hey hey, put me down!", "What the hell, who grabbed me?!", "Easy, easy! I'm scared of heights!"],
    drop: ["…Fine. Nice view from here anyway.", "Next time, ask before you pick me up. Thanks.", "Good thing I can fly. No harm done."],
    tourStart: "Hold on tight! Let me show you around the room.",
    tourEnd: "That's the tour! Click anything you like. I'll keep flying.",
    tourStop: "Sure, explore on your own. Poke me if you need me.",
    stops: {
      about: "This old computer is “About”. Click it and my intro shows up on the screen.",
      photos: "The polaroid on the monitor is me. The frames on the wall and desk hold old photos of mine.",
      shelf: "My projects sit on the bookshelf, next to a bagua mirror, a golden toad and talismans. For good luck, and fewer bugs.",
      game: "This handheld leads to the Aggie 3A interactive demo. Click it to go.",
      work: "The yellow notepad has my career and projects. Click to open it.",
      tv: "The big TV: teletext for my posts, tapes for the promo film. The buttons on the panel all work.",
      calc: "The calculator is real. Pick it up and try 1+1.",
      card: "My business cards are in this holder. Take one out and flip it over.",
      online: "The phone and modem handle “Online” and “Services”. Dial-up, how retro.",
      music: "The cassette in the boombox is a song I wrote. Click to play it.",
    },
  },
  de: {
    ui: { tour: "Führ mich herum", next: "Weiter", stop: "Stopp", open: "Öffnen", mute: "Ton aus", unmute: "Ton an" },
    hello: "Hi! Ich bin der Mini-He-Pengyuan und drehe auf dem fliegenden Schwert meine Runde. Tipp mich an oder zieh mich herum.",
    greet: [
      "Hör auf zu stupsen, ich fliege hier Schwert und habe noch keinen Führerschein.",
      "Willkommen! In diesem Zimmer kann man alles anklicken. Nur zu.",
      "Hallo! Ich bin der Mini-He-Pengyuan. Der große hat gerade zu tun.",
      "Dieses Schwert braucht weder Benzin noch Ladekabel. Sehr umweltfreundlich.",
      "Draußen regnet es. Perfekt für Musik, einen Film oder ein bisschen Rechnen.",
      "Psst: Mit V wechselst du die Ansicht. Am Handy tippst du oben auf den runden Knopf.",
      "Soll ich dich führen? Tipp unten auf „Führ mich herum“.",
      "Fliege ich nicht elegant? Fünf Sterne, bitte.",
    ],
    swear: [
      "Verdammt, hör auf zu stupsen! Gleich falle ich von diesem Scheißschwert.",
      "Scheiße, das macht dir wohl richtig Spaß, was?",
      "Verdammt noch mal, ich fliege hier Schwert. Etwas Respekt!",
      "Na gut, du bist der Boss. Stups ruhig weiter.",
    ],
    grab: ["Hey, hey, hey, lass mich runter!", "Was zum Teufel, wer hat mich gepackt?!", "Vorsicht, Vorsicht! Ich habe Höhenangst!"],
    drop: ["… Na gut. Die Aussicht hier ist auch nicht schlecht.", "Frag nächstes Mal, bevor du mich hochhebst. Danke.", "Zum Glück kann ich fliegen. Nichts passiert."],
    tourStart: "Gut festhalten! Ich zeige dir das Zimmer.",
    tourEnd: "Das war die Runde! Klick an, was du magst. Ich fliege weiter.",
    tourStop: "Alles klar, schau dich selbst um. Stups mich, wenn du mich brauchst.",
    stops: {
      about: "Dieser alte Computer ist „Über mich“. Klick ihn an, dann steht meine Vorstellung auf dem Bildschirm.",
      photos: "Das Polaroid am Monitor bin ich. In den Rahmen an der Wand und auf dem Tisch stecken alte Fotos von mir.",
      shelf: "Im Regal stehen meine Projekte, daneben ein Bagua-Spiegel, eine goldene Kröte und Talismane. Für Glück und weniger Bugs.",
      game: "Diese Handheld-Konsole führt zur interaktiven Aggie-3A-Demo. Klick sie an, und los geht's.",
      work: "Auf dem gelben Notizblock stehen mein Werdegang und meine Projekte. Ein Klick schlägt ihn auf.",
      tv: "Der große Fernseher: Teletext für meine Beiträge, Kassetten für den Imagefilm. Alle Tasten am Gerät funktionieren.",
      calc: "Der Taschenrechner ist echt. Nimm ihn und probier 1+1.",
      card: "In diesem Halter stecken meine Visitenkarten. Zieh eine heraus und dreh sie um.",
      online: "Telefon und Modem stehen für „Kontakt“ und „Leistungen“. Einwahl per Modem, schön retro.",
      music: "Auf der Kassette im Rekorder ist ein Song von mir. Ein Klick spielt ihn ab.",
    },
  },
  ko: {
    ui: { tour: "둘러보기", next: "다음", stop: "그만", open: "열어 보기", mute: "음소거", unmute: "소리 켜기" },
    hello: "안녕하세요! 미니 허펑위안이에요. 날아다니는 검을 타고 방을 순찰 중입니다. 저를 누르면 말하고, 끌어서 옮길 수도 있어요.",
    greet: [
      "그만 찔러요. 검 타는 중인데 아직 면허도 없다고요.",
      "어서 오세요! 이 방 물건은 전부 눌러 볼 수 있어요. 편하게 보세요.",
      "안녕하세요, 미니 허펑위안입니다. 본체는 지금 바빠요.",
      "이 검은 기름도 충전도 필요 없어요. 친환경이죠.",
      "밖에는 비가 와요. 음악 듣고 영상 보고 계산하기 딱 좋은 날이에요.",
      "살짝 알려 드릴게요. V 키로 시점을 바꿀 수 있어요. 휴대폰에서는 위쪽 동그란 버튼을 누르세요.",
      "안내가 필요하세요? 아래 ‘둘러보기’를 눌러 주세요.",
      "저 잘 날죠? 별 다섯 개 부탁해요.",
    ],
    swear: [
      "아 씨, 그만 찔러요! 이러다 이 망할 검에서 떨어지겠네.",
      "젠장, 찌르는 데 재미 붙였죠?",
      "제기랄, 검 타는 중이라고요. 좀 진지하게!",
      "네네, 잘났어요. 계속 찔러 보세요.",
    ],
    grab: ["어어어, 내려 줘요!", "아 씨, 누가 날 집었어?!", "살살, 살살! 저 고소공포증 있어요!"],
    drop: ["…뭐, 여기 경치도 나쁘지 않네요.", "다음엔 들기 전에 말 좀 해 주세요. 감사합니다.", "검을 탈 줄 알아서 다행이네요. 안 다쳤어요."],
    tourStart: "꽉 잡으세요! 방을 한 바퀴 안내할게요.",
    tourEnd: "다 둘러봤어요! 나머지는 마음대로 눌러 보세요. 저는 계속 날게요.",
    tourStop: "네, 편하게 둘러보세요. 필요하면 저를 누르세요.",
    stops: {
      about: "이 오래된 컴퓨터가 ‘소개’예요. 누르면 화면에 제 소개가 나와요.",
      photos: "모니터에 붙은 폴라로이드가 저예요. 벽과 책상 위 액자에는 제 옛날 사진이 있어요.",
      shelf: "책장에는 제 작업물이 있고, 팔괘 거울과 금두꺼비, 부적도 있어요. 복도 빌고 버그도 막아 줍니다.",
      game: "이 휴대용 게임기는 Aggie 3A 인터랙티브 데모로 이어져요. 누르면 출발합니다.",
      work: "노란 메모장에는 제 이력과 작업이 적혀 있어요. 누르면 펼쳐져요.",
      tv: "큰 TV예요. 문자 방송으로 글을 보고, 테이프를 넣으면 홍보 영상이 나와요. 패널 버튼도 전부 눌러져요.",
      calc: "계산기는 장식이 아니에요. 들어서 1+1을 눌러 보세요.",
      card: "명함 케이스에 제 명함이 있어요. 한 장 꺼내서 뒤집어 볼 수도 있어요.",
      online: "전화기와 모뎀은 ‘연락처’와 ‘서비스’ 담당이에요. 전화 접속이라니, 복고풍이죠.",
      music: "카세트에는 제가 쓴 노래가 들어 있어요. 누르면 재생돼요.",
    },
  },
};

/* 带逛的路线：[落脚点, 书桌机位序号, 亮起来的热点, 「打开看看」要开的视图]。按机位分组，镜头只换四次。 */
const TOUR = [
  ["about", 1, "about", "about"],
  ["photos", 1, null, null],
  ["shelf", 2, null, "work"],
  ["game", 4, "game", null],
  ["work", 4, "work", "work"],
  ["tv", 4, "film", "film"],
  ["calc", 4, null, "calc"],
  ["card", 4, null, "card"],
  ["online", 4, "online", "online"],
  ["music", 3, null, "music"],
];

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const approach = (value, goal, step) => (value < goal ? Math.min(goal, value + step) : Math.max(goal, value - step));
const turnToward = (from, to, k) => {
  const diff = ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
  return from + diff * k;
};

/* ------------------------------------------------------------------ 小人和飞剑 */

function createActor(host, emit) {
  const { THREE, scene, camera, perches, reducedMotion, bounds } = host;
  const { clamp, lerp } = THREE.MathUtils;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  /* 房间是夜景，白衣服不给一点自发光会显得发灰。 */
  const mat = (color, roughness = 0.8, metalness = 0, glow = 0) => new THREE.MeshStandardMaterial({
    color, roughness, metalness, emissive: glow ? color : 0x000000, emissiveIntensity: glow,
  });
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const cloth = mat(0xf7f5ee, 0.9, 0, 0.2);
  const trim = mat(0xcfcabb, 0.8, 0, 0.12);
  const skin = mat(0xf4d2b8, 0.8, 0, 0.14);
  const hairMat = mat(0x18171c, 0.5);
  const ink = mat(0x231a17, 0.6);
  const rimless = mat(0xd9dee4, 0.3, 0.85, 0.1);

  const root = new THREE.Group();
  root.userData.action = "avatar";
  root.rotation.order = "YXZ";
  const rig = new THREE.Group();
  root.add(rig);

  /* 阔腿裤 + 白鞋：以胯为轴，跑的时候前后摆。 */
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.017, 0.072, 0);
    add(leg, new THREE.CylinderGeometry(0.017, 0.023, 0.06, 12), cloth, 0, -0.03, 0);
    const shoe = add(leg, new THREE.SphereGeometry(0.016, 12, 8), cloth, 0, -0.064, 0.008);
    shoe.scale.set(1, 0.5, 1.5);
    const sole = add(leg, new THREE.CylinderGeometry(0.015, 0.015, 0.003, 12), mat(0xcdb48e, 0.8), 0, -0.0705, 0.008);
    sole.scale.set(1, 1, 1.5);
    rig.add(leg);
    return leg;
  });

  /* 唐装：下摆略宽的上衣、立领、一排盘扣。 */
  add(rig, new THREE.CylinderGeometry(0.03, 0.042, 0.08, 18), cloth, 0, 0.104, 0);
  const frontAt = (y) => 0.042 - ((y - 0.064) / 0.08) * 0.012 + 0.001;
  const placket = add(rig, new THREE.BoxGeometry(0.0028, 0.074, 0.002), trim, 0, 0.104, frontAt(0.104));
  placket.rotation.x = -0.15;
  for (let i = 0; i < 5; i += 1) {
    const y = 0.078 + i * 0.0135;
    add(rig, new THREE.BoxGeometry(0.015, 0.003, 0.003), trim, 0, y, frontAt(y) + 0.0006);
  }
  add(rig, new THREE.CylinderGeometry(0.0115, 0.0115, 0.014, 12), skin, 0, 0.149, 0);
  const collar = add(rig, new THREE.CylinderGeometry(0.0168, 0.019, 0.013, 16, 1, true), cloth, 0, 0.148, 0);
  collar.material = cloth.clone();
  collar.material.side = THREE.DoubleSide;

  /* 袖子和手：以肩为轴。arms[0] 在左（−x），arms[1] 在右（+x）。 */
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.035, 0.136, 0);
    add(arm, new THREE.CylinderGeometry(0.0115, 0.0145, 0.056, 10), cloth, 0, -0.028, 0);
    add(arm, new THREE.SphereGeometry(0.0095, 10, 8), skin, 0, -0.061, 0);
    rig.add(arm);
    return arm;
  });

  /* 大头：黑发往上梳，细框眼镜，带笑。 */
  const head = new THREE.Group();
  head.position.set(0, 0.196, 0);
  rig.add(head);
  const skull = add(head, new THREE.SphereGeometry(0.046, 24, 18), skin);
  skull.scale.set(1, 0.95, 0.96);
  const hairTop = add(head, new THREE.SphereGeometry(0.0488, 24, 14, 0, TAU, 0, Math.PI * 0.5), hairMat, 0, 0.002, -0.002);
  hairTop.rotation.x = -0.42;
  const hairBack = add(head, new THREE.SphereGeometry(0.0484, 24, 14, 0, TAU, 0, Math.PI * 0.5), hairMat, 0, 0, -0.003);
  hairBack.rotation.x = -1.35;
  for (const [x, y, z, tilt, lean, size] of [[-0.016, 0.04, 0.024, 0.75, 0.25, 1], [0.002, 0.045, 0.026, 0.8, -0.05, 1.15], [0.019, 0.04, 0.022, 0.7, -0.3, 0.95], [-0.004, 0.047, 0.006, 0.3, 0.1, 1]]) {
    const tuft = add(head, new THREE.ConeGeometry(0.012 * size, 0.03 * size, 7), hairMat, x, y, z);
    tuft.rotation.set(tilt, 0, lean);
  }
  for (const side of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.008, 10, 8), skin, side * 0.0445, -0.004, 0);
    const eye = add(head, new THREE.SphereGeometry(0.0058, 12, 10), ink, side * 0.0165, 0.001, 0.0405);
    eye.scale.set(1, 1.25, 0.5);
    add(head, new THREE.SphereGeometry(0.0017, 8, 6), mat(0xffffff, 0.3, 0, 0.8), side * 0.0165 + 0.002, 0.0038, 0.0438);
    const brow = add(head, new THREE.BoxGeometry(0.012, 0.0022, 0.002), ink, side * 0.0165, 0.0155, 0.0405);
    brow.rotation.z = side * -0.12;
    add(head, new THREE.TorusGeometry(0.0118, 0.0011, 6, 22), rimless, side * 0.0168, 0.001, 0.0445);
    const temple = add(head, new THREE.BoxGeometry(0.0012, 0.0012, 0.04), rimless, side * 0.0295, 0.003, 0.026);
    temple.rotation.y = side * 0.32;
    const blush = add(head, new THREE.CircleGeometry(0.0062, 14), new THREE.MeshBasicMaterial({ color: 0xf0988f, transparent: true, opacity: 0.42 }), side * 0.028, -0.011, 0.0372);
    blush.rotation.y = side * 0.62;
    blush.castShadow = false;
  }
  add(head, new THREE.BoxGeometry(0.009, 0.0012, 0.0012), rimless, 0, 0.003, 0.0462);
  const smile = add(head, new THREE.TorusGeometry(0.0072, 0.0012, 5, 12, Math.PI), mat(0xb5584a, 0.7), 0, -0.0135, 0.0425);
  smile.rotation.z = Math.PI;

  /* 飞剑：沿 +z 指向前方。踩在脚下时放平，落地时背到背上。 */
  const sword = new THREE.Group();
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.0125, -0.12);
  bladeShape.lineTo(0.0125, -0.12);
  bladeShape.lineTo(0.0125, 0.115);
  bladeShape.lineTo(0, 0.165);
  bladeShape.lineTo(-0.0125, 0.115);
  bladeShape.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.004, bevelEnabled: false });
  bladeGeometry.rotateX(Math.PI / 2);
  bladeGeometry.translate(0, 0.002, 0);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe2edf5, roughness: 0.22, metalness: 0.85, emissive: 0x58c8ff, emissiveIntensity: 0.6 });
  add(sword, bladeGeometry, bladeMat);
  add(sword, new THREE.BoxGeometry(0.003, 0.0016, 0.21), new THREE.MeshBasicMaterial({ color: 0xbfeeff }), 0, 0.0028, 0.0);
  const gold = mat(0xd9b24a, 0.3, 0.85, 0.15);
  add(sword, new THREE.BoxGeometry(0.052, 0.009, 0.012), gold, 0, 0, -0.126);
  const hilt = add(sword, new THREE.CylinderGeometry(0.0062, 0.0062, 0.05, 10), mat(0x5b1f1a, 0.7), 0, 0, -0.157);
  hilt.rotation.x = Math.PI / 2;
  add(sword, new THREE.SphereGeometry(0.009, 10, 8), gold, 0, 0, -0.186);
  add(sword, new THREE.CylinderGeometry(0.0022, 0.0034, 0.034, 6), mat(0xc0281f, 0.8, 0, 0.2), 0, -0.02, -0.19);
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext("2d");
  const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,.4)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowSprite = (opacity) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color: 0x7fdcff, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.raycast = () => {};
    return sprite;
  };
  const aura = glowSprite(0.3);
  aura.scale.set(0.3, 0.12, 1);
  sword.add(aura);
  root.add(sword);
  const SWORD_BACK = { pos: V(0.004, 0.122, -0.054), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -0.5, "ZXY")), scale: 0.6 };
  const SWORD_FEET = { pos: V(0, -0.004, 0), quat: new THREE.Quaternion(), scale: 1 };

  /* 比身子大一圈的隐形球：手机上好点、好拖。 */
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.12;
  root.add(hit);
  root.visible = false; /* 第一帧 update 之后才出现 */
  scene.add(root);

  /* 飞行时剑尾的光点。 */
  const trail = Array.from({ length: 9 }, () => {
    const sprite = glowSprite(0);
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  });
  const history = [];
  let trailAt = 0;
  let flying = 0;

  /* ---- 状态 */
  const BASE = 0.85;
  const STANCE = -0.9; /* 踩剑时身子侧过来 */
  const st = {
    pos: perches.tv.pos.clone(), at: "tv", yaw: 0, mode: "idle",
    mount: 0, mountGoal: 0, show: 0, showGoal: 1, dwell: 5, roam: !reducedMotion,
    air: 0, spin: 0, pitch: 0, roll: 0, phase: 0, headYaw: 0, talking: false, lean: 0,
  };
  let path = null;
  let emote = null;
  let lastPerch = null;
  const drag = { plane: new THREE.Plane(), offset: V(), target: V(), point: V(), normal: V(), sway: 0, lastX: 0 };
  const ORDER = Object.keys(perches);
  const tangent = V();
  const swordWorld = V();
  const projected = V();
  const dwellTime = () => 3.5 + Math.random() * 4;

  function cancelPath() {
    if (!path) return;
    const { resolve } = path;
    path = null;
    resolve(false);
  }

  function arrive() {
    const done = path;
    path = null;
    const perch = perches[done.id];
    st.pos.copy(done.to);
    st.at = done.id;
    st.mode = "idle";
    st.mountGoal = perch.stand ? 0 : 1;
    st.dwell = dwellTime();
    done.resolve(true);
    emit({ type: "arrive", id: done.id });
  }

  /* 去某个落脚点。桌面上两点之间跑着跳着去，其余踩剑飞过去。到了以后 resolve(true)；半路被打断 resolve(false)。 */
  function go(id) {
    const perch = perches[id];
    if (!perch || st.mode === "drag") return Promise.resolve(false);
    cancelPath();
    return new Promise((resolve) => {
      const from = st.pos.clone();
      const to = perch.pos.clone();
      const distance = from.distanceTo(to);
      const run = Boolean(perches[st.at]?.desk && perch.desk && st.mount < 0.5);
      const ctrl = from.clone().lerp(to, 0.5);
      if (!run) {
        ctrl.y = Math.max(from.y, to.y) + 0.14 + distance * 0.2;
        ctrl.z += 0.1 + distance * 0.1;
      }
      path = {
        id, from, to, ctrl, run, resolve, t: 0,
        wait: run || reducedMotion ? 0 : 0.28,
        duration: reducedMotion ? 0.01 : run ? clamp(distance / 0.55, 0.6, 2.8) : clamp(distance / 0.9, 0.9, 2.6),
        steps: Math.max(2, Math.round(distance / 0.12)),
      };
      st.mode = run ? "run" : "fly";
      st.mountGoal = run ? 0 : 1;
      st.at = null;
      if (distance < 0.02) arrive();
    });
  }

  function wander() {
    const here = st.at;
    let pool = ORDER.filter((id) => id !== here && id !== lastPerch);
    /* 在桌面上时多半接着在桌面上跑跑跳跳。 */
    if (perches[here]?.desk && Math.random() < 0.55) pool = pool.filter((id) => perches[id].desk);
    lastPerch = here;
    go(pool[Math.floor(Math.random() * pool.length)] || "tv");
  }

  function startEmote(name) {
    emote = { name, t: 0, duration: { jump: 0.62, wave: 1.5, shake: 0.7 }[name] || 0.6 };
  }

  /* ---- 被拎着走：在正对镜头、过小人的那个平面里跟着手指。 */
  function grab(ray) {
    cancelPath();
    camera.getWorldDirection(drag.normal);
    drag.point.copy(st.pos);
    drag.point.y += 0.12 * root.scale.y;
    drag.plane.setFromNormalAndCoplanarPoint(drag.normal, drag.point);
    if (ray.intersectPlane(drag.plane, drag.point)) drag.offset.subVectors(drag.point, st.pos);
    else drag.offset.set(0, 0, 0);
    drag.target.copy(st.pos);
    drag.lastX = st.pos.x;
    st.mode = "drag";
    st.mountGoal = 0;
    st.at = null;
    emit({ type: "grab" });
  }

  function dragTo(ray) {
    if (st.mode !== "drag" || !ray.intersectPlane(drag.plane, drag.point)) return;
    drag.target.subVectors(drag.point, drag.offset);
    bounds.clampPoint(drag.target, drag.target);
  }

  function drop() {
    if (st.mode !== "drag") return;
    st.mode = "idle";
    st.mountGoal = 1; /* 松手就召剑，原地悬停一会儿再接着逛 */
    st.dwell = 3.4;
    emit({ type: "drop" });
  }

  /* ---- 每帧 */
  function update(dt, realDt, time) {
    const step = Math.min(realDt, 0.1);
    st.show = approach(st.show, st.showGoal, step / 0.22);
    root.visible = st.show > 0.01;
    if (!root.visible) {
      for (const sprite of trail) sprite.visible = false;
      return;
    }
    st.mount = approach(st.mount, st.mountGoal, step / 0.3);
    let moving = false;
    let yawGoal = null;
    let pitchGoal = 0;

    if (st.mode === "drag") {
      st.pos.lerp(drag.target, 1 - Math.exp(-step * 18));
      drag.sway = lerp(drag.sway, clamp((st.pos.x - drag.lastX) / Math.max(step, 0.001) * -0.5, -0.7, 0.7), 1 - Math.exp(-step * 8));
      drag.lastX = st.pos.x;
    } else if (path) {
      if (path.wait > 0) {
        path.wait -= step;
      } else {
        path.t = Math.min(1, path.t + step / path.duration);
        const k = path.run ? path.t : easeInOut(path.t);
        if (path.run) {
          st.pos.lerpVectors(path.from, path.to, k);
          st.pos.y += Math.abs(Math.sin(k * Math.PI * path.steps)) * 0.028 + Math.sin(Math.PI * clamp((k - 0.3) / 0.4, 0, 1)) * 0.085;
          st.phase = k * path.steps * Math.PI;
          tangent.subVectors(path.to, path.from);
        } else {
          const a = (1 - k) * (1 - k);
          const b = 2 * (1 - k) * k;
          const c = k * k;
          st.pos.set(
            a * path.from.x + b * path.ctrl.x + c * path.to.x,
            a * path.from.y + b * path.ctrl.y + c * path.to.y,
            a * path.from.z + b * path.ctrl.z + c * path.to.z,
          );
          tangent.set(
            (1 - k) * (path.ctrl.x - path.from.x) + k * (path.to.x - path.ctrl.x),
            (1 - k) * (path.ctrl.y - path.from.y) + k * (path.to.y - path.ctrl.y),
            (1 - k) * (path.ctrl.z - path.from.z) + k * (path.to.z - path.ctrl.z),
          );
          pitchGoal = clamp(-Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z)) * 0.6, -0.45, 0.45);
        }
        moving = true;
        if (Math.hypot(tangent.x, tangent.z) > 1e-4) yawGoal = Math.atan2(tangent.x, tangent.z);
        if (path.t >= 1) arrive();
      }
    } else if (st.roam) {
      st.dwell -= step;
      if (st.dwell <= 0) wander();
    }

    /* 朝向：赶路时冲着前进方向，其余时候身子冲着镜头。 */
    const stance = STANCE * st.mount;
    if (yawGoal === null) yawGoal = Math.atan2(camera.position.x - st.pos.x, camera.position.z - st.pos.z) - stance;
    const before = st.yaw;
    st.yaw = turnToward(st.yaw, yawGoal, 1 - Math.exp(-step * 8));
    const flyingNow = moving && path && !path.run;
    st.roll = lerp(st.roll, flyingNow ? clamp((st.yaw - before) / Math.max(step, 0.001) * -0.12, -0.4, 0.4) : 0, 1 - Math.exp(-step * 6));
    st.pitch = lerp(st.pitch, pitchGoal, 1 - Math.exp(-step * 6));
    st.headYaw = lerp(st.headYaw, flyingNow ? 0.6 : 0, 1 - Math.exp(-step * 7));

    /* 表情动作：跳起来转一圈、挥手、气得直抖。 */
    st.air = 0;
    st.spin = 0;
    let shake = 0;
    let wave = 0;
    if (emote) {
      emote.t = Math.min(1, emote.t + step / emote.duration);
      if (emote.name === "jump") {
        st.air = Math.sin(Math.PI * emote.t) * 0.11;
        st.spin = TAU * easeInOut(emote.t);
      } else if (emote.name === "shake") {
        shake = Math.sin(emote.t * 44) * 0.16 * (1 - emote.t);
      } else if (emote.name === "wave") {
        wave = Math.min(1, emote.t * 6, (1 - emote.t) * 6);
      }
      if (emote.t >= 1) emote = null;
    }

    const hover = st.mount > 0.5 && !moving ? Math.sin(time * 2.1) * 0.012 : 0;
    const scale = BASE * lerp(1, 1.3, host.narrow) * easeInOut(st.show);
    root.scale.setScalar(scale);
    root.position.set(st.pos.x, st.pos.y + (hover + st.air) * scale, st.pos.z);
    root.rotation.set(st.pitch, st.yaw + st.spin, st.roll);

    const k = 1 - Math.exp(-step * 14);
    const dragging = st.mode === "drag";
    const running = moving && path?.run;
    const swing = running ? Math.sin(st.phase) : 0;
    rig.rotation.y = stance;
    rig.rotation.x = lerp(rig.rotation.x, running ? 0.2 : 0, k);
    rig.rotation.z = dragging ? drag.sway : shake;
    rig.position.y = st.mount < 0.5 && !moving && !dragging ? Math.sin(time * 2.3) * 0.0025 : 0;
    const kick = dragging ? Math.sin(time * 9) * 0.4 : 0;
    legs[0].rotation.x = lerp(legs[0].rotation.x, dragging ? kick : swing * 0.95 - st.mount * 0.22, k);
    legs[1].rotation.x = lerp(legs[1].rotation.x, dragging ? -kick : -swing * 0.95 + st.mount * 0.22, k);
    legs[0].rotation.z = lerp(legs[0].rotation.z, -st.mount * 0.12, k);
    legs[1].rotation.z = lerp(legs[1].rotation.z, st.mount * 0.12, k);
    const sway = Math.sin(time * 1.7) * 0.03;
    arms[0].rotation.x = lerp(arms[0].rotation.x, dragging ? 0 : -swing * 0.8 + st.mount * 0.75, k);
    arms[1].rotation.x = lerp(arms[1].rotation.x, dragging || wave > 0 ? 0 : swing * 0.8 + st.mount * 0.75, k);
    arms[0].rotation.z = lerp(arms[0].rotation.z, dragging ? -2.5 : -0.14 - sway + st.mount * 0.44, k);
    arms[1].rotation.z = lerp(arms[1].rotation.z, dragging ? 2.5 : wave > 0 ? 2.3 + Math.sin(time * 16) * 0.35 : 0.14 + sway - st.mount * 0.44, k);
    head.rotation.y = st.headYaw;
    head.rotation.x = st.talking ? Math.sin(time * 9) * 0.05 : 0;
    head.rotation.z = Math.sin(time * 0.9) * 0.03;

    sword.position.lerpVectors(SWORD_BACK.pos, SWORD_FEET.pos, st.mount);
    sword.quaternion.slerpQuaternions(SWORD_BACK.quat, SWORD_FEET.quat, st.mount);
    sword.scale.setScalar(lerp(SWORD_BACK.scale, SWORD_FEET.scale, st.mount));
    aura.material.opacity = 0.12 + 0.3 * st.mount;
    bladeMat.emissiveIntensity = 0.45 + 0.35 * st.mount + Math.sin(time * 5) * 0.05;

    /* 剑尾的光点：只在飞的时候留下。 */
    flying = lerp(flying, flyingNow ? 1 : 0, 1 - Math.exp(-step * 6));
    trailAt -= step;
    if (flyingNow && trailAt <= 0) {
      trailAt = 0.03;
      sword.getWorldPosition(swordWorld);
      history.unshift(swordWorld.clone());
      history.length = Math.min(history.length, trail.length);
    }
    trail.forEach((sprite, index) => {
      const point = history[index];
      sprite.visible = Boolean(point) && flying > 0.02;
      if (!sprite.visible) return;
      sprite.position.copy(point);
      sprite.scale.setScalar((0.1 - index * 0.008) * scale);
      sprite.material.opacity = flying * (1 - index / trail.length) * 0.5;
    });

    actor.onFrame?.();
  }

  const actor = {
    pickRoot: root,
    onFrame: null,
    get visible() {
      return st.showGoal > 0 && root.visible;
    },
    get at() {
      return st.at;
    },
    update,
    go,
    grab,
    dragTo,
    drop,
    tap: () => emit({ type: "tap" }),
    emote: startEmote,
    talk(on) {
      st.talking = Boolean(on);
    },
    setRoam(on) {
      st.roam = Boolean(on) && !reducedMotion;
      st.dwell = dwellTime();
    },
    setVisible(on) {
      st.showGoal = on ? 1 : 0;
    },
    reset() {
      cancelPath();
      emote = null;
      history.length = 0;
      Object.assign(st, { at: "tv", mode: "idle", mount: 0, mountGoal: 0, showGoal: 1, dwell: 5 });
      st.pos.copy(perches.tv.pos);
    },
    /* 头顶在页面上的位置（像素）和小人在屏幕上有多高，气泡跟着它。 */
    screen() {
      projected.copy(root.position).project(camera);
      const feet = (-projected.y * 0.5 + 0.5) * host.height;
      projected.copy(root.position);
      projected.y += 0.27 * root.scale.y;
      projected.project(camera);
      const y = (-projected.y * 0.5 + 0.5) * host.height;
      return {
        x: (projected.x * 0.5 + 0.5) * host.width,
        y,
        tall: Math.max(24, feet - y),
        ok: projected.z < 1 && root.visible,
        width: host.width,
        height: host.height,
      };
    },
    dispose() {
      cancelPath();
      scene.remove(root, ...trail);
      root.traverse((node) => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
      for (const sprite of trail) sprite.material.dispose();
      glowTexture.dispose();
    },
  };
  return actor;
}

/* ------------------------------------------------------------------ 气泡、台词和带逛 */

export function start({ room, overlay, lang = "zh", coarse = false, openView = () => {}, session = null }) {
  const T = STRINGS[lang] || STRINGS.zh;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const bubble = element("div", "room-say");
  bubble.hidden = true;
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");
  const line = element("p", "say-t");
  const acts = element("div", "say-acts");
  bubble.append(line, acts);
  overlay.append(bubble);

  let view = "desk";
  let hideTimer = 0;
  let tour = null;
  let lastSaid = 0;
  let size = { w: 0, h: 0 };
  let audio = null;
  let voiceEnd = null; /* 结束当前这句录音：播完、出错或被打断时调用 */
  let speech = Promise.resolve(false); /* 当前这句录音；播完得到 true，没播成或被打断得到 false */
  let muted = session?.get(MUTE_KEY) === "1";
  let said = 0;
  let introduced = false;
  let refocus = false;
  const warmed = new Set();
  const taps = [];
  const turn = { greet: Math.floor(Math.random() * T.greet.length), swear: 0, grab: 0, drop: 0 };

  const actor = room.addActor(createActor, onEvent);
  if (!actor) {
    bubble.remove();
    return null;
  }

  function place() {
    if (bubble.hidden) return;
    const p = actor.screen();
    bubble.classList.toggle("is-off", !p.ok);
    if (!p.ok) return;
    let left = clamp(p.x - size.w / 2, 8, Math.max(8, p.width - size.w - 8));
    let top = p.y - size.h - 14;
    /* 头顶上放不下（小人站得太高）就放到它旁边；手机上两边也放不下，就放到脚下。别把它自己挡住。 */
    let side = "";
    if (top < 58) {
      const gap = p.tall * 0.45 + 16;
      if (p.x + gap + size.w + 8 <= p.width) {
        side = "is-right";
        left = p.x + gap;
      } else if (p.x - gap - size.w >= 8) {
        side = "is-left";
        left = p.x - gap - size.w;
      } else {
        side = "is-below";
      }
      top = side === "is-below"
        ? p.y + p.tall + 14
        : clamp(p.y + p.tall * 0.3 - size.h / 2, 58, Math.max(58, p.height - size.h - 70));
    }
    for (const name of ["is-right", "is-left", "is-below"]) bubble.classList.toggle(name, name === side);
    bubble.style.setProperty("--tail", `${Math.round(clamp(p.x - left, 18, size.w - 18))}px`);
    bubble.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }
  actor.onFrame = place;

  /* 气泡里的按钮被换掉或收起时，焦点会掉到 body 上，房间的快捷键（Esc、V、G）就都收不到了：
     先把焦点还给房间。返回 true 表示焦点原本在气泡里，下一个气泡出来时把焦点放回它的主按钮。 */
  function releaseFocus() {
    if (!bubble.contains(document.activeElement)) return false;
    overlay.focus({ preventScroll: true });
    return true;
  }

  function hide() {
    window.clearTimeout(hideTimer);
    quiet();
    refocus = releaseFocus() || refocus;
    bubble.classList.remove("is-on");
    bubble.hidden = true;
    actor.talk(false);
  }

  /* ---- 本人录音 */
  const voiceUrl = (id) => `${VOICE_DIR}${id}.mp3?v=${VOICE_REV}`;
  const voiced = (id) => !muted && VOICE.has(id);

  /* 把接下来多半要说的那句先拉进浏览器缓存，轮到它时不用等下载。访客点过小人之后才会调用。 */
  function warm(id) {
    if (!voiced(id) || warmed.has(id)) return;
    warmed.add(id);
    fetch(voiceUrl(id)).catch(() => {});
  }

  function quiet() {
    audio?.pause();
    voiceEnd?.(false);
  }

  /* 只播本人录音；没有录音或已静音就返回 null，只出文字。第一次必须在点击里调用，手机才允许出声；
     之后一直复用同一个 Audio，带逛时不在点击里也能接着说。返回的 Promise 在这句结束时兑现。 */
  function speak(id) {
    quiet();
    if (!voiced(id)) return null;
    audio ||= new Audio();
    audio.src = voiceUrl(id);
    speech = new Promise((resolve) => {
      let timer = 0;
      const finish = (played) => {
        if (voiceEnd !== finish) return;
        voiceEnd = null;
        window.clearTimeout(timer);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onFailed);
        resolve(played === true);
      };
      const onEnded = () => finish(true);
      const onFailed = () => finish(false);
      voiceEnd = finish;
      timer = window.setTimeout(onFailed, 20000); /* 网络卡住时别让带逛一直等下去 */
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onFailed);
      audio.play()?.catch?.(onFailed);
    });
    return speech;
  }

  /* 有录音的台词，气泡里带一个静音开关：访客可能在办公室或地铁上。本次会话内记住。 */
  function soundButton() {
    const button = element("button", "say-b say-mute", muted ? T.ui.unmute : T.ui.mute);
    button.type = "button";
    button.addEventListener("click", () => {
      muted = !muted;
      session?.set(MUTE_KEY, muted ? "1" : "0");
      if (muted) quiet();
      button.textContent = muted ? T.ui.unmute : T.ui.mute;
    });
    return button;
  }

  /* buttons: [文字, 回调, 是否主按钮]；counter: 带逛时的「3/10」。有录音就返回 speak() 的 Promise。 */
  function say(id, text, { buttons = [], counter = "", hold = 0, voice = true } = {}) {
    window.clearTimeout(hideTimer);
    const mine = ++said;
    const spoken = voice ? speak(id) : (quiet(), null);
    const giveFocus = releaseFocus() || refocus;
    refocus = false;
    line.replaceChildren();
    if (counter) line.append(element("span", "say-n", counter));
    line.append(text);
    acts.replaceChildren(...buttons.map(([label, handler, main]) => {
      const button = element("button", main ? "say-b is-main" : "say-b", label);
      button.type = "button";
      button.addEventListener("click", handler);
      return button;
    }));
    if (voice && VOICE.has(id)) acts.append(soundButton());
    acts.hidden = acts.childElementCount === 0;
    bubble.hidden = false;
    if (giveFocus && document.activeElement === overlay) acts.querySelector(".is-main")?.focus({ preventScroll: true });
    size = { w: bubble.offsetWidth, h: bubble.offsetHeight };
    place();
    requestAnimationFrame(() => bubble.classList.add("is-on"));
    actor.talk(true);
    lastSaid = performance.now();
    const perChar = /[㐀-鿿가-힯]/.test(text) ? 170 : 62;
    const until = lastSaid + (hold || clamp(2200 + text.length * perChar, 3200, 9000));
    /* 气泡至少留够读完的时间；有录音的话，还要等这句说完。 */
    const later = () => {
      hideTimer = window.setTimeout(hide, Math.max(spoken ? 700 : 0, until - performance.now()));
    };
    if (spoken) {
      spoken.then(() => {
        if (said === mine && !bubble.hidden) later();
      });
    } else {
      later();
    }
    return spoken;
  }

  const next = (group) => {
    const index = turn[group] % T[group].length;
    turn[group] += 1;
    return [`${group}${index + 1}`, T[group][index]];
  };
  const tourButton = () => [T.ui.tour, () => startTour(), true];

  /* ---- 带逛 */
  function stopTour(sayBye = false) {
    if (!tour) return false;
    window.clearTimeout(tour.timer);
    tour = null;
    room.highlight(null);
    actor.setRoam(true);
    if (sayBye) say("tourStop", T.tourStop);
    else hide();
    return true;
  }

  function finishTour() {
    window.clearTimeout(tour?.timer);
    tour = null;
    room.highlight(null);
    room.setDeskView(0);
    actor.setRoam(true);
    actor.emote("jump");
    say("tourEnd", T.tourEnd);
  }

  /* keep：上一句（“发车”）还在说，就别打断它——先飞着，等它说完再介绍这一站。 */
  function tourStep(index, keep = false) {
    if (index >= TOUR.length) {
      finishTour();
      return;
    }
    window.clearTimeout(tour?.timer);
    const current = (tour = { index, timer: 0 });
    const [id, preset, hot, target] = TOUR[index];
    if (!keep) hide();
    room.setDeskView(preset);
    room.highlight(hot);
    warm(`stop-${id}`);
    const breath = keep ? speech.then(() => new Promise((resolve) => window.setTimeout(resolve, 450))) : speech;
    Promise.all([actor.go(id), breath]).then(([arrived]) => {
      if (tour !== current || !arrived) return;
      const buttons = [[index + 1 < TOUR.length ? T.ui.next : T.ui.stop, () => tourStep(index + 1), true]];
      if (target) {
        buttons.push([T.ui.open, () => {
          stopTour();
          openView(target);
        }]);
      }
      if (index + 1 < TOUR.length) buttons.push([T.ui.stop, () => stopTour(true)]);
      const shown = performance.now();
      const spoken = say(`stop-${id}`, T.stops[id], { buttons, counter: `${index + 1}/${TOUR.length}`, hold: 60000 });
      warm(index + 1 < TOUR.length ? `stop-${TOUR[index + 1][0]}` : "tourEnd");
      /* 说完这句再去下一站；没出声（没录音、静音、浏览器不让播）就按读完文字的时间算。 */
      const advance = (played) => {
        if (tour !== current) return;
        const since = performance.now() - shown;
        const rest = played ? Math.max(1400, 6000 - since) : Math.max(0, 7600 - since);
        current.timer = window.setTimeout(() => {
          if (tour === current) tourStep(index + 1);
        }, rest);
      };
      if (spoken) spoken.then(advance);
      else advance(false);
    });
  }

  function startTour() {
    if (view !== "desk") return;
    stopTour();
    actor.setRoam(false);
    tour = { index: -1, timer: 0 };
    const current = tour;
    actor.emote("jump");
    say("tourStart", T.tourStart, { hold: 1900 });
    warm(`stop-${TOUR[0][0]}`);
    current.timer = window.setTimeout(() => {
      if (tour === current) tourStep(0, true);
    }, 1900);
  }

  /* ---- 点它、拎它、它自己到了某处 */
  function poke() {
    if (stopTour(true)) return;
    const now = performance.now();
    while (taps.length && now - taps[0] > 5000) taps.shift();
    taps.push(now);
    if (taps.length >= 3) {
      /* 五秒里被戳三下以上：烦了，爆粗口。 */
      actor.emote("shake");
      say(...next("swear"));
      return;
    }
    if (!introduced && voiced("hello")) {
      /* 进房间时那句招呼只出了文字（浏览器不让没点过的页面出声）；第一次被点，先用本人的声音把它说出来。 */
      introduced = true;
      actor.emote("wave");
      say("hello", T.hello, { buttons: [tourButton()] });
    } else {
      actor.emote(turn.greet % 2 ? "wave" : "jump");
      say(...next("greet"), { buttons: [tourButton()] });
    }
    warm(`greet${(turn.greet % T.greet.length) + 1}`);
    warm("tourStart");
  }

  function onEvent(event) {
    if (view !== "desk") return;
    if (event.type === "tap") {
      poke();
    } else if (event.type === "grab") {
      stopTour();
      say(...next("grab"), { hold: 60000 });
    } else if (event.type === "drop") {
      say(...next("drop"));
    } else if (event.type === "arrive" && !tour && bubble.hidden && T.stops[event.id]) {
      /* 自己逛到某件东西旁边时，偶尔介绍一句；不出声，也不太频繁。 */
      if (performance.now() - lastSaid > 22000 && Math.random() < 0.5) {
        say(`stop-${event.id}`, T.stops[event.id], { hold: 4200, voice: false });
      }
    }
  }

  /* 第一次进房间：等房间站稳了打个招呼（手机上等那句“左右拖动”的提示过去）。每次会话一次。 */
  const helloTimer = window.setTimeout(() => {
    if (view !== "desk" || tour || !bubble.hidden || session?.get(HI_KEY) === "1") return;
    session?.set(HI_KEY, "1");
    actor.emote("wave");
    say("hello", T.hello, { buttons: [tourButton()], voice: false });
  }, coarse ? 7800 : 2600);

  return {
    /* 启动器换视图时告诉这里：离开书桌就收起气泡、停止带逛。 */
    setView(nextView) {
      view = nextView;
      if (view !== "desk") {
        stopTour();
        hide();
      }
    },
    /* 书桌视角下的快捷键：G 带逛 / 停止，H 让它说话，Esc 停止带逛。处理了就返回 true。 */
    key(key) {
      if (view !== "desk") return false;
      if (key === "g") {
        if (!stopTour(true)) startTour();
        return true;
      }
      if (key === "h") {
        poke();
        return true;
      }
      return key === "escape" ? stopTour(true) : false;
    },
    dispose() {
      window.clearTimeout(helloTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(tour?.timer);
      tour = null;
      quiet();
      bubble.remove();
      actor.onFrame = null;
    },
  };
}
