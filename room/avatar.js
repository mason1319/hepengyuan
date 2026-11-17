/* 何鹏远个人网站 —— 3D 房间里的小人：Q 版何鹏远，御剑飞行；还有他的助理胡以沫，坐着小飞机

   房间亮起来之后由 /room/boot.js 按需加载，不拖慢进房间；加载失败就没有小人，房间其余部分不受影响。
   这个模块做三件事：
   1. createActor：纯程序化建模的小人和飞剑（白色唐装、黑发、眼镜，照本人形象照设计），以及它的动作——
      踩剑飞行、在桌面上跑和跳、落到电脑 / 电视 / 录音机顶上、被拎着走。
   2. createAide：助理胡以沫和她的小飞机（照她的照片程序化建模，照片本身不进仓库）——她一直坐在飞机里，
      在屋里飞来飞去、绕着何鹏远小人转、偶尔停到电视或录音机顶上；可以点、可以拖。
   3. createVoice：一个角色的出声（一个复用的 Audio）。两个小人各有一个，各播各的本人录音。
   4. start：气泡、台词、带逛（按顺序介绍房间里的物件）和两个人说话的先后。

   约束：
   - 没有 import：three.js 由 scene.js 通过 host 交进来，保证是同一份。
   - 台词只有招呼、玩笑和对房间物件的说明，不写任何履历事实；平时不说脏话，被连戳或被拎起来才爆粗口。
   - 说话的声音只能是本人的录音（assets/room/voice/）：何鹏远小人用何鹏远的，胡以沫用她自己的（文件名带 yimo- 前缀），
     互不借用；没有录音的台词只出文字气泡，不用机器合成。
   - 样式在 styles.css 的「hi-fi 房间」一节；位置用 CSSOM 写（站点 CSP 是 style-src 'self'）。 */

const TAU = Math.PI * 2;
const HI_KEY = "hpy-room-hi"; /* 本次会话已经打过招呼 */
const MUTE_KEY = "hpy-room-mute"; /* 本次会话里访客把小人静音了 */
const AIDE_HI_KEY = "hpy-room-hi2"; /* 本次会话里助理胡以沫已经自我介绍过 */

/* 本人录音：文件是 VOICE_DIR + 台词 id + ".mp3"。录好一句就把 id 加进 VOICE；不在这里的台词只出文字。
   录的是普通话，四种语言的页面都播这一份，气泡里的译文当字幕。重录某一句后把 VOICE_REV 加一，
   否则访客浏览器会继续用缓存里的旧录音（/assets/ 缓存七天）。 */
const VOICE_DIR = "/assets/room/voice/";
const VOICE_REV = "2";
const VOICE = new Set([
  "hello",
  "greet1", "greet2", "greet3", "greet4", "greet5", "greet6", "greet7", "greet8",
  "swear1", "swear2", "swear3", "swear4",
  "grab1", "grab2", "grab3",
  "drop1", "drop2", "drop3",
  "tourStart", "tourEnd", "tourStop",
  "stop-about", "stop-photos", "stop-shelf", "stop-game", "stop-work",
  "stop-tv", "stop-calc", "stop-card", "stop-online", "stop-music",
  "stop-relics", "stop-armchair", "stop-cord", "stop-projector",
  "cute1", "cute2", "cute3",
  "rogue1", "rogue2", "rogue3",
]);
/* 助理胡以沫本人的录音：文件是 VOICE_DIR + "yimo-" + 台词 id + ".mp3"，id 是 hi，或者 AIDE_LINES 里的
   组名 + 序号（chat1、fuss2……）。录好一句登记一句，没登记的只出文字。她自己冒出来的话（进房间的自我介绍、
   给他让位）不出声，所以 giveWay 不用录。换掉已有的录音同样要把 VOICE_REV 加一。 */
const AIDE_VOICE_PREFIX = "yimo-";
const AIDE_VOICE = new Set([
  "hi",
  "chat1", "chat2", "chat3", "chat4", "chat5", "chat6", "chat7", "chat8",
  "fuss1", "fuss2", "fuss3",
  "held1", "held2", "held3",
  "freed1", "freed2", "freed3",
  "scold1", "scold2", "scold3",
  "escort1", "escort2",
  "bossHeld1", "bossHeld2",
]);

const STRINGS = {
  zh: {
    ui: { play: "放给我看", pull: "拉一下", tour: "带我逛逛", next: "下一个", stop: "不逛了", open: "打开看看", mute: "静音", unmute: "开声音", tapSound: "点这里出声", noSound: "放不出声" },
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
    /* 撒娇和耍赖：被访客戳出来的才出声；小人自己落地时赖的那一句只出文字。 */
    cute: ["哎呀，再陪我玩一会儿嘛！", "人家飞了一天咯，夸我一句好不好嘛？", "你别走嘛，我给你放电影看。"],
    rogue: ["不管不管，我就躺在这儿，谁也别想让我起来。", "我不飞了，除非你夸我。", "哎呀，累了。耍个赖，五秒钟就好。"],
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
      relics: "这张旧桌子是九十年代家里的老物件，有电风扇、暖水瓶、搪瓷缸、算盘、煤油灯，还有罗盘、貔貅、文昌塔这些摆件。电风扇可以点开关哟。",
      armchair: "这把是海南黄花梨的圈椅，扶手从靠背一路弯下来，连成一整圈。挂在墙上的是工笔的牡丹《花开富贵》。",
      projector: "这台老放映机是真的在转，它的片盘、胶片、光柱一样都不少。要不要我放一段给你看呢？",
      screen: "幕布上放的是 Aggie 的短片和我的宣传片。镜头可以拖着转，凑近了看片盘。",
      cord: "这个灯绳拉一下，雨夜就变成晴天了；再拉一下，又变回来了。",
    },
  },
  en: {
    ui: { play: "Play it", pull: "Pull it", tour: "Show me around", next: "Next", stop: "Stop", open: "Open it", mute: "Mute", unmute: "Sound on", tapSound: "Tap for sound", noSound: "No sound" },
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
    cute: ["Aww, stay and play a little longer?", "I've been flying all day. Say something nice?", "Don't go yet, I'll put a film on for you."],
    rogue: ["Nope. I'm lying right here and nobody can make me get up.", "I'm not flying again until you say I'm great.", "Tired. Five seconds of sulking, then I'm back."],
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
      relics: "This old table holds things from a nineties home: a fan, a thermos, an enamel mug, an abacus and an oil lamp, plus a feng shui compass, a pixiu and a little pagoda. The fan switches on and off.",
      armchair: "This is a Ming-style round-backed armchair in Hainan huanghuali: the arm rail sweeps from the back down to both hands in one curve. On the wall hangs a fine-brush peony painting, Blossoming Fortune.",
      projector: "This old projector really runs: reels, film and a beam of light. Want me to play something?",
      screen: "The screen shows the Aggie shorts and my promo film. Drag to look around, zoom in on the reels.",
      cord: "This is the light cord. One pull turns the rainy night into a sunny afternoon; pull again to go back.",
    },
  },
  de: {
    ui: { play: "Abspielen", pull: "Ziehen", tour: "Führ mich herum", next: "Weiter", stop: "Stopp", open: "Öffnen", mute: "Ton aus", unmute: "Ton an", tapSound: "Für Ton tippen", noSound: "Kein Ton" },
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
    cute: ["Och, bleib doch noch ein bisschen.", "Ich fliege schon den ganzen Tag. Ein kleines Lob?", "Geh noch nicht, ich lege dir einen Film ein."],
    rogue: ["Nö. Ich bleibe hier liegen, mich bewegt keiner.", "Ich fliege erst wieder, wenn du mich lobst.", "Müde. Fünf Sekunden schmollen, dann geht es weiter."],
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
      relics: "Auf dem alten Tisch stehen Dinge aus einem Zuhause der Neunziger: Ventilator, Thermoskanne, Emaillebecher, Abakus und Petroleumlampe, dazu Feng-Shui-Kompass, Pixiu und eine kleine Pagode. Den Ventilator kann man ein- und ausschalten.",
      armchair: "Das ist ein Rundlehnstuhl im Ming-Stil aus Hainan-Huanghuali: Die Armlehne läuft in einem Bogen von der Rückenlehne bis zu beiden Händen. An der Wand hängt ein Pfingstrosenbild in feiner Pinselmalerei: Blühender Reichtum.",
      projector: "Dieser alte Projektor läuft wirklich: Spulen, Film und ein Lichtstrahl. Soll ich etwas abspielen?",
      screen: "Auf der Leinwand laufen die Aggie-Kurzfilme und mein Imagefilm. Zieh, um dich umzusehen, und zoom an die Spulen heran.",
      cord: "Das ist die Zugschnur. Einmal ziehen macht aus der Regennacht einen sonnigen Nachmittag, noch einmal und es regnet wieder.",
    },
  },
  ko: {
    ui: { play: "틀어 줘", pull: "당기기", tour: "둘러보기", next: "다음", stop: "그만", open: "열어 보기", mute: "음소거", unmute: "소리 켜기", tapSound: "눌러서 소리 켜기", noSound: "소리 안 남" },
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
    cute: ["에이, 조금만 더 놀아 줘요.", "하루 종일 날았어요. 칭찬 한마디만요?", "가지 마요, 영화 틀어 줄게요."],
    rogue: ["몰라요. 여기 누울 거예요, 아무도 못 일으켜요.", "칭찬해 줄 때까지 안 날 거예요.", "피곤해요. 5초만 떼쓸게요."],
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
      relics: "이 낡은 탁자에는 90년대 집에 있던 물건들이 있어요. 선풍기, 보온병, 법랑 컵, 주판, 석유등, 그리고 나침반과 비휴, 작은 탑 같은 풍수 소품이요. 선풍기는 눌러서 켜고 끌 수 있어요.",
      armchair: "이건 하이난 황화리로 만든 명나라식 권의예요. 팔걸이가 등받이에서 양손까지 하나의 곡선으로 이어져요. 벽에는 공필 모란도 「화개부귀」가 걸려 있어요.",
      projector: "이 낡은 영사기는 진짜로 돌아가요. 릴, 필름, 빛줄기까지요. 한 편 틀어 드릴까요?",
      screen: "스크린에는 Aggie 단편과 제 홍보 영상이 나와요. 드래그해서 둘러보고 릴을 가까이서 보세요.",
      cord: "이건 전등 줄이에요. 한 번 당기면 비 오는 밤이 맑은 오후가 되고, 다시 당기면 돌아와요.",
    },
  },
};

/* 助理胡以沫的台词（四种语言，只出文字气泡——没有她本人的录音就不出声）。
   只有招呼、玩笑和她跟何鹏远小人之间的拌嘴，不写任何履历事实；她是个小朋友，任何时候都不说脏话（校验脚本会查）。
   chat 里第 TOUR_LINE 句是“让他带你逛”，气泡上带「带我逛逛」按钮。 */
const AIDE_LINES = {
  zh: {
    who: "胡以沫 · 助理",
    hi: "我是胡以沫，我开小飞机！",
    chat: [
      "报告！胡以沫正在开小飞机巡逻。",
      "我的小飞机不用加油，吃一颗糖，就能飞一整天。",
      "他踩剑，我开小飞机，看谁飞得快！",
      "助理的工作：看家，还有追着他飞。",
      "让他带你，我在天上看，跟着飞。",
      "屋里没有风，适合开飞机。",
      "嘘——我在数书架上有几本书，别打岔。",
      "你也想坐吗？可是只有一个位置呀。",
    ],
    fuss: ["哎呀，别戳啦，飞机都要被晃掉啦！", "再戳，我就告诉何鹏远！", "哼，我再飞高点，你就够不着啦。"],
    held: ["啊——我的飞机！快放开！", "救命呀，有人劫机啦！", "别拎我啦，我在执行任务呢！"],
    freed: ["呼，吓死我了。继续巡逻！", "下次要买票哟。", "还好我技术好，稳住啦。"],
    scold: ["扣一朵小红花！", "我都听见啦，要讲文明哦。", "老板，要注意形象！"],
    giveWay: ["你来啦？这儿让给你，我去飞一圈。", "让位让位，助理起飞！"],
    escort: ["出发！他带路，我护航。", "逛房间咯，我在后面跟着！"],
    bossHeld: ["放开他！算了，你要轻一点哦。", "喂，那是我老板！"],
  },
  en: {
    who: "Hu Yimo · assistant",
    hi: "I'm Hu Yimo, and I fly the little plane!",
    chat: [
      "Reporting in! Hu Yimo, on patrol in my little plane.",
      "My plane needs no fuel. One sweet and it flies all day.",
      "He has a sword, I have a plane. Let's see who's faster!",
      "An assistant's job: mind the room, and chase him around.",
      "Let him show you around. I'll watch from up here and fly along.",
      "No wind indoors. Perfect flying weather.",
      "Shh, I'm counting the books on the shelf. Don't interrupt.",
      "Want a ride? Sorry, there's only one seat.",
    ],
    fuss: ["Hey, stop poking! You're shaking my plane!", "Poke me again and I'm telling He Pengyuan!", "Hmph. I'll fly higher, then you can't reach me."],
    held: ["Aah, my plane! Let go!", "Help! Someone's hijacking my plane!", "Don't grab me, I'm on a mission!"],
    freed: ["Phew, that scared me. Back on patrol!", "Next time, buy a ticket.", "Good thing I'm a great pilot. Steady now."],
    scold: ["That's one gold star gone!", "I heard that. Mind your manners!", "Boss, think of your image!"],
    giveWay: ["Oh, it's you. Take the spot, I'll go for a spin.", "Make way, make way. Assistant taking off!"],
    escort: ["Off we go! He leads, I escort.", "Tour time! I'll be right behind."],
    bossHeld: ["Let him go! …Fine, but be gentle.", "Hey, that's my boss!"],
  },
  de: {
    who: "Hu Yimo · Assistentin",
    hi: "Ich bin Hu Yimo, und ich fliege das kleine Flugzeug!",
    chat: [
      "Melde mich zum Dienst! Hu Yimo, mit dem kleinen Flugzeug auf Streife.",
      "Mein Flugzeug braucht kein Benzin. Ein Bonbon, und es fliegt den ganzen Tag.",
      "Er hat ein Schwert, ich habe ein Flugzeug. Mal sehen, wer schneller ist!",
      "Was eine Assistentin macht: aufs Zimmer aufpassen und ihm hinterherfliegen.",
      "Lass dich von ihm führen. Ich schaue von oben zu und fliege hinterher.",
      "Im Zimmer weht kein Wind. Bestes Flugwetter.",
      "Pst, ich zähle gerade die Bücher im Regal. Nicht stören.",
      "Willst du mitfliegen? Leider gibt es nur einen Sitz.",
    ],
    fuss: ["Hey, nicht stupsen! Mein Flugzeug wackelt schon!", "Noch ein Stups, und ich sage es He Pengyuan!", "Pah. Ich fliege höher, da kommst du nicht ran."],
    held: ["Aah, mein Flugzeug! Lass los!", "Hilfe, mein Flugzeug wird entführt!", "Nicht festhalten, ich bin im Einsatz!"],
    freed: ["Puh, habe ich mich erschreckt. Weiter geht die Streife!", "Nächstes Mal bitte ein Ticket kaufen.", "Zum Glück fliege ich so gut. Alles stabil."],
    scold: ["Ein Fleißsternchen weniger!", "Das habe ich gehört. Bitte anständig bleiben!", "Chef, denk an deinen Ruf!"],
    giveWay: ["Ach, du bist es. Der Platz gehört dir, ich drehe eine Runde.", "Platz da, Platz da. Die Assistentin hebt ab!"],
    escort: ["Los geht's! Er führt, ich gebe Geleitschutz.", "Zimmerrunde! Ich bleibe dicht dahinter."],
    bossHeld: ["Lass ihn los! … Na gut, aber sei vorsichtig.", "Hey, das ist mein Chef!"],
  },
  ko: {
    who: "후이모 · 조수",
    hi: "저는 후이모예요. 작은 비행기를 몰아요!",
    chat: [
      "보고합니다! 후이모, 작은 비행기로 순찰 중이에요.",
      "제 비행기는 기름이 필요 없어요. 사탕 하나면 하루 종일 날아요.",
      "그분은 검, 저는 비행기. 누가 더 빠른지 볼까요?",
      "조수가 하는 일: 방 지키기, 그리고 그분 쫓아다니기.",
      "그분이 안내해 드릴 거예요. 저는 하늘에서 보면서 따라갈게요.",
      "방 안에는 바람이 없어서 비행하기 딱 좋아요.",
      "쉿, 책장에 책이 몇 권인지 세는 중이에요. 방해하지 마세요.",
      "타 보고 싶으세요? 자리가 하나뿐이라서요.",
    ],
    fuss: ["아이참, 그만 찔러요! 비행기가 흔들리잖아요!", "또 찌르면 허펑위안한테 이를 거예요!", "흥, 더 높이 날 거예요. 그럼 손이 안 닿죠."],
    held: ["아악, 내 비행기! 놔 주세요!", "도와주세요, 비행기 납치예요!", "잡지 마세요, 임무 수행 중이라고요!"],
    freed: ["휴, 깜짝 놀랐네. 다시 순찰!", "다음에는 표를 사세요.", "제가 조종을 잘해서 다행이에요."],
    scold: ["칭찬 스티커 하나 뺄 거예요!", "다 들었어요. 고운 말 쓰세요!", "사장님, 이미지 관리하셔야죠!"],
    giveWay: ["오셨어요? 여기 앉으세요, 저는 한 바퀴 돌고 올게요.", "비켜요 비켜요, 조수 이륙합니다!"],
    escort: ["출발! 그분이 안내하고, 저는 호위할게요.", "방 구경 시작! 바로 뒤에서 따라갈게요."],
    bossHeld: ["놔 주세요! …알았어요, 살살 다뤄 주세요.", "저기요, 그분 제 사장님이에요!"],
  },
};
const TOUR_LINE = 4;

/* 带逛的路线：[落脚点, 书桌机位序号, 亮起来的热点, 「打开看看」要开的视图]。按机位分组，镜头只换四次。 */
const TOUR = [
  ["about", 1, "about", "about"],
  ["photos", 1, null, null],
  ["shelf", 2, null, "work"],
  ["relics", 5, null, null],
  ["armchair", 5, null, null],
  ["game", 4, "game", null],
  ["work", 4, "work", "work"],
  ["tv", 4, "film", "film"],
  ["calc", 4, null, "calc"],
  ["card", 4, null, "card"],
  ["online", 4, "online", "online"],
  ["music", 3, null, "music"],
  ["cord", 0, null, null],
  ["projector", 6, null, "cinema"],
];
/* 某一站除了“打开看看”之外小人还能替访客做的事：[按钮文字的键, 交给启动器的动作]。
   以后新物件要让小人能“用”它，在这里加一行，再在 boot.js 的 guideAct 里接住。 */
const STOP_ACTIONS = { projector: ["play", "film"], cord: ["pull", "light"] };
const POSES = new Set(["stand", "prone", "lie", "tantrum", "cute"]);

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
  /* 先绕身体的竖轴转（侧身、趴下时翻面），再整个人放倒：躺下的姿态靠这个顺序。 */
  rig.rotation.order = "ZYX";
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
    /* 姿态：站着之外还能趴着、侧躺、耍赖打滚、撒娇。pose 是现在摆的，poseGoal 是想摆的，poseAmt 是摆到了几成。 */
    pose: "stand", poseGoal: "stand", poseRest: "stand", poseAmt: 0, poseTimer: 0,
  };
  /* 调试用：网址带 ?pose=prone（或 lie / tantrum / cute）时，落地就一直摆这个姿态，方便看效果。 */
  const forcedPose = (() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get("pose");
      return POSES.has(wanted) ? wanted : null;
    } catch {
      return null;
    }
  })();
  if (forcedPose) {
    /* 调试时一进房间就在电视顶上摆好这个姿态，也不乱跑，方便凑近看。 */
    Object.assign(st, { pose: forcedPose, poseGoal: forcedPose, poseRest: forcedPose, poseAmt: 1, roam: false });
  }
  /* 自己逛到某个落脚点时摆什么姿态：那个落脚点登记了 poses 就从里面挑，没登记用默认的一组。带逛时老实站着。 */
  const idlePose = (perch) => {
    if (!perch?.stand) return "stand";
    if (forcedPose) return forcedPose;
    if (!st.roam) return "stand";
    const options = perch.poses || ["stand", "stand", "prone", "lie", "cute"];
    return options[Math.floor(Math.random() * options.length)];
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
    st.poseGoal = st.poseRest = idlePose(perch);
    st.poseTimer = 0;
    done.resolve(true);
    emit({ type: "arrive", id: done.id, pose: st.poseGoal });
  }

  /* 去某个落脚点。桌面上两点之间跑着跳着去，其余踩剑飞过去。到了以后 resolve(true)；半路被打断 resolve(false)。 */
  function go(id) {
    const perch = perches[id];
    if (!perch || st.mode === "drag") return Promise.resolve(false);
    cancelPath();
    st.poseGoal = st.poseRest = "stand";
    st.poseTimer = 0;
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
    st.poseGoal = st.poseRest = "stand";
    st.poseTimer = 0;
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

    /* 姿态只在落地站稳时摆；一动身、被拎起来、上了剑就先收回站姿。换姿态时先收再放，不会从趴着直接拧成躺着。 */
    if (st.poseTimer > 0) {
      st.poseTimer -= step;
      if (st.poseTimer <= 0) st.poseGoal = st.poseRest;
    }
    const grounded = st.mode === "idle" && !path && st.mountGoal === 0 && st.mount < 0.05;
    const wantPose = grounded ? st.poseGoal : "stand";
    if (wantPose !== st.pose) {
      st.poseAmt = approach(st.poseAmt, 0, step / 0.2);
      if (st.poseAmt === 0) st.pose = wantPose;
    } else if (st.pose !== "stand") {
      st.poseAmt = approach(st.poseAmt, 1, step / 0.42);
    }
    const posed = st.pose === "stand" ? 0 : easeInOut(st.poseAmt);
    const laid = st.pose === "prone" || st.pose === "lie" || st.pose === "tantrum" ? posed : 0;
    const cute = st.pose === "cute" ? posed : 0;
    const fit = st.pose === "tantrum" ? posed : 0;

    const hover = st.mount > 0.5 && !moving ? Math.sin(time * 2.1) * 0.012 : 0;
    const scale = BASE * lerp(1, 1.3, host.narrow) * easeInOut(st.show);
    root.scale.setScalar(scale);
    root.position.set(st.pos.x, st.pos.y + (hover + st.air) * scale, st.pos.z);
    root.rotation.set(st.pitch, st.yaw + st.spin, st.roll);

    const k = 1 - Math.exp(-step * 14);
    const dragging = st.mode === "drag";
    const running = moving && path?.run;
    const swing = running ? Math.sin(st.phase) : 0;
    /* 身体：放倒是绕前后轴转 90°（人横在镜头前）；趴着再绕身体的竖轴把胸口翻向下，耍赖是仰面左右打滚。 */
    const turnOver = st.pose === "prone" ? Math.PI / 2 : st.pose === "tantrum" ? -Math.PI / 2 + Math.sin(time * 8) * 0.5 : 0;
    rig.rotation.y = stance + turnOver * posed;
    rig.rotation.x = lerp(rig.rotation.x, running ? 0.2 : 0, k);
    rig.rotation.z = (dragging ? drag.sway : shake) - (Math.PI / 2) * laid + cute * Math.sin(time * 5) * 0.16;
    const bob = st.mount < 0.5 && !moving && !dragging ? Math.sin(time * 2.3) * 0.0025 : 0;
    rig.position.set(
      -0.105 * laid,
      bob * (1 - laid) + 0.036 * laid + fit * Math.abs(Math.sin(time * 11)) * 0.012 + cute * Math.abs(Math.sin(time * 5)) * 0.01,
      0,
    );
    const kick = dragging ? Math.sin(time * 9) * 0.4 : 0;
    const sway = Math.sin(time * 1.7) * 0.03;
    const goal = {
      legL: dragging ? kick : swing * 0.95 - st.mount * 0.22,
      legR: dragging ? -kick : -swing * 0.95 + st.mount * 0.22,
      armLx: dragging ? 0 : -swing * 0.8 + st.mount * 0.75,
      armRx: dragging || wave > 0 ? 0 : swing * 0.8 + st.mount * 0.75,
      armLz: dragging ? -2.5 : -0.14 - sway + st.mount * 0.44,
      armRz: dragging ? 2.5 : wave > 0 ? 2.3 + Math.sin(time * 16) * 0.35 : 0.14 + sway - st.mount * 0.44,
      headX: st.talking ? Math.sin(time * 9) * 0.05 : 0,
      headY: st.headYaw,
      headZ: Math.sin(time * 0.9) * 0.03,
    };
    if (posed > 0) {
      const to = (key, value) => {
        goal[key] = lerp(goal[key], value, posed);
      };
      if (st.pose === "prone") {
        /* 趴着：两只手垫在下巴前面，抬头看镜头，小腿一上一下地晃。 */
        to("legL", 0.9 + Math.sin(time * 5) * 0.55);
        to("legR", 0.9 + Math.sin(time * 5 + Math.PI) * 0.55);
        to("armLx", -2.7);
        to("armRx", -2.7);
        to("armLz", -0.35);
        to("armRz", 0.35);
        to("headX", -1.1);
        to("headY", -0.9);
      } else if (st.pose === "lie") {
        /* 侧躺：贴地那只手撑着头，上面那条腿屈着，脚尖一点一点。 */
        to("legL", 0.55 + Math.sin(time * 1.6) * 0.12);
        to("armRx", 0);
        to("armRz", 2.55);
        to("headZ", 0.75);
      } else if (st.pose === "tantrum") {
        /* 耍赖：仰面躺着打滚，手脚乱蹬。 */
        to("legL", -0.9 + Math.sin(time * 13) * 0.8);
        to("legR", -0.9 - Math.sin(time * 13) * 0.8);
        to("armLx", -1.6 + Math.sin(time * 11) * 1.0);
        to("armRx", -1.6 - Math.sin(time * 11) * 1.0);
        to("headZ", Math.sin(time * 9) * 0.3);
      } else if (st.pose === "cute") {
        /* 撒娇：两只手捧着脸，歪着头左右晃，脚尖一踮一踮。 */
        to("armLx", -0.45);
        to("armRx", -0.45);
        to("armLz", -2.75);
        to("armRz", 2.75);
        to("headZ", Math.sin(time * 5) * 0.22);
      }
    }
    legs[0].rotation.x = lerp(legs[0].rotation.x, goal.legL, k);
    legs[1].rotation.x = lerp(legs[1].rotation.x, goal.legR, k);
    legs[0].rotation.z = lerp(legs[0].rotation.z, -st.mount * 0.12, k);
    legs[1].rotation.z = lerp(legs[1].rotation.z, st.mount * 0.12, k);
    arms[0].rotation.x = lerp(arms[0].rotation.x, goal.armLx, k);
    arms[1].rotation.x = lerp(arms[1].rotation.x, goal.armRx, k);
    arms[0].rotation.z = lerp(arms[0].rotation.z, goal.armLz, k);
    arms[1].rotation.z = lerp(arms[1].rotation.z, goal.armRz, k);
    head.rotation.set(goal.headX, goal.headY, goal.headZ);

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
    /* 脚下的位置：助理绕着它飞。 */
    get pos() {
      return st.pos;
    },
    update,
    go,
    grab,
    dragTo,
    drop,
    tap: () => emit({ type: "tap" }),
    emote: startEmote,
    /* 临时摆个姿态（耍赖、撒娇、躺一会儿），到时间回到原来的样子。只有落地站着时摆得出来。 */
    pose(name, seconds = 2.6) {
      if (!POSES.has(name)) return;
      st.poseGoal = name;
      st.poseTimer = seconds;
      st.dwell = Math.max(st.dwell, seconds + 1.2);
    },
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
      Object.assign(st, { at: "tv", mode: "idle", mount: 0, mountGoal: 0, showGoal: 1, dwell: 5, pose: "stand", poseGoal: "stand", poseRest: "stand", poseAmt: 0, poseTimer: 0 });
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

/* ------------------------------------------------------------------ 助理胡以沫和她的小飞机 */

/* 她能把飞机停在哪些落脚点上（scene.js 的 perches 里的 id）：顶上够平、够宽、旁边没有别的摆件的几处
   （老物件桌上东西太挤，圈椅的落脚点在椅圈上，都停不下一架飞机）。
   何鹏远小人正站在那儿时她不去；他后到的话，她让位起飞。 */
const PADS = ["tv", "about", "music"];

function createAide(host, emit) {
  const { THREE, scene, camera, perches, reducedMotion, bounds } = host;
  const { clamp, lerp, smoothstep } = THREE.MathUtils;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const mat = (color, roughness = 0.8, metalness = 0, glow = 0) => new THREE.MeshStandardMaterial({
    color, roughness, metalness, emissive: glow ? color : 0x000000, emissiveIntensity: glow,
  });
  /* 零件多，只让大件投影子。 */
  const add = (parent, geometry, material, x = 0, y = 0, z = 0, shadow = false) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    parent.add(mesh);
    return mesh;
  };
  const cream = mat(0xf5eedd, 0.9, 0, 0.2);
  const ruffle = mat(0xf5eedd, 0.9, 0, 0.2);
  ruffle.side = THREE.DoubleSide;
  const brown = mat(0x6a4433, 0.85, 0, 0.12);
  const skin = mat(0xf3cfb3, 0.8, 0, 0.14);
  const hairMat = mat(0x221a18, 0.55);
  const ink = mat(0x231a17, 0.6);
  const scrunchie = mat(0xa6212f, 1, 0, 0.32);
  const paint = mat(0xcf3d33, 0.42, 0.1, 0.18);
  paint.side = THREE.DoubleSide;
  const ivory = mat(0xf3e9d2, 0.6, 0, 0.16);
  const brass = mat(0xe3b23f, 0.35, 0.6, 0.15);
  const tyre = mat(0x26262b, 0.9);

  /* 背带裙的藏青格子：画在一小块画布上，平铺。夜里靠一点自发光才看得出格子。 */
  const plaidCanvas = document.createElement("canvas");
  plaidCanvas.width = plaidCanvas.height = 64;
  const plaidContext = plaidCanvas.getContext("2d");
  plaidContext.fillStyle = "#222a3f";
  plaidContext.fillRect(0, 0, 64, 64);
  plaidContext.fillStyle = "rgba(128,138,165,.5)";
  plaidContext.fillRect(0, 10, 64, 14);
  plaidContext.fillRect(10, 0, 14, 64);
  plaidContext.fillStyle = "rgba(240,240,245,.9)";
  plaidContext.fillRect(0, 42, 64, 2.5);
  plaidContext.fillRect(42, 0, 2.5, 64);
  plaidContext.fillStyle = "rgba(240,240,245,.45)";
  plaidContext.fillRect(0, 54, 64, 1.5);
  plaidContext.fillRect(54, 0, 1.5, 64);
  const plaidTexture = new THREE.CanvasTexture(plaidCanvas);
  plaidTexture.wrapS = plaidTexture.wrapT = THREE.RepeatWrapping;
  plaidTexture.repeat.set(4, 1);
  plaidTexture.colorSpace = THREE.SRGBColorSpace;
  const plaid = new THREE.MeshStandardMaterial({
    map: plaidTexture, roughness: 0.9, emissive: 0xffffff, emissiveMap: plaidTexture, emissiveIntensity: 0.22, side: THREE.DoubleSide,
  });

  const root = new THREE.Group();
  root.userData.action = "aide";
  /* 机身中心离轮子着地点的高度：飞的时候绕机身中心俯仰、侧倾；停稳时轮子正好落在落脚点上。
     下面所有零件的坐标都以机身中心为原点，机头朝 +z。 */
  const PIVOT = 0.062;
  const body = new THREE.Group();
  body.rotation.order = "YXZ";
  root.add(body);

  /* 小飞机：九十年代铁皮玩具的样子——红机身、米色机翼、黄色桨帽，敞着的座舱。 */
  const hull = new THREE.LatheGeometry(
    [[0, -0.12], [0.007, -0.118], [0.0125, -0.095], [0.021, -0.05], [0.029, -0.008], [0.0325, 0.03], [0.0315, 0.066], [0.028, 0.084], [0.0265, 0.088]]
      .map(([radius, along]) => new THREE.Vector2(radius, along)),
    20,
  );
  hull.rotateX(Math.PI / 2);
  add(body, hull, paint, 0, 0, 0, true).scale.y = 1.06;
  add(body, new THREE.CylinderGeometry(0.0275, 0.0285, 0.012, 20), ivory, 0, 0, 0.092).rotation.x = Math.PI / 2;
  const prop = new THREE.Group();
  prop.position.set(0, 0, 0.101);
  body.add(prop);
  add(prop, new THREE.ConeGeometry(0.0115, 0.022, 14), brass, 0, 0, 0.009).rotation.x = Math.PI / 2;
  add(prop, new THREE.BoxGeometry(0.0125, 0.128, 0.003), mat(0x8b5a2b, 0.6, 0, 0.12), 0, 0, 0.002);
  /* 转快了看不清桨叶，只剩一圈淡淡的影子。 */
  const blur = add(prop, new THREE.CircleGeometry(0.066, 28), new THREE.MeshBasicMaterial({
    color: 0xfff4dc, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  }), 0, 0, 0.004);
  add(body, new THREE.CylinderGeometry(1, 1, 0.0075, 30), ivory, 0, -0.02, 0.012, true).scale.set(0.135, 1, 0.035);
  for (const side of [-1, 1]) {
    add(body, new THREE.BoxGeometry(0.012, 0.0084, 0.044), paint, side * 0.098, -0.02, 0.012);
    /* 翼尖的航行灯：左红右绿（飞机自己的左右）。 */
    add(body, new THREE.SphereGeometry(0.0036, 8, 6), new THREE.MeshBasicMaterial({ color: side > 0 ? 0xff5a4d : 0x4dff9a }), side * 0.134, -0.02, 0.012);
    add(body, new THREE.CylinderGeometry(0.0024, 0.0024, 0.03, 6), brass, side * 0.046, -0.035, 0.03);
    add(body, new THREE.CylinderGeometry(0.014, 0.014, 0.008, 16), tyre, side * 0.046, -0.048, 0.03).rotation.z = Math.PI / 2;
    add(body, new THREE.CylinderGeometry(0.006, 0.006, 0.0094, 10), ivory, side * 0.046, -0.048, 0.03).rotation.z = Math.PI / 2;
  }
  add(body, new THREE.CylinderGeometry(1, 1, 0.005, 20), ivory, 0, 0.004, -0.1).scale.set(0.05, 1, 0.02);
  const fin = add(body, new THREE.CylinderGeometry(1, 1, 0.005, 20), paint, 0, 0.022, -0.103);
  fin.scale.set(0.03, 1, 0.024);
  fin.rotation.z = Math.PI / 2;
  add(body, new THREE.SphereGeometry(0.005, 8, 6), tyre, 0, -0.014, -0.108);
  /* 座舱：一圈皮垫子围着的黑洞，前面一小片风挡。 */
  const pit = add(body, new THREE.CircleGeometry(0.0235, 18), mat(0x1b1516, 1), 0, 0.029, -0.004);
  pit.rotation.x = -Math.PI / 2;
  pit.scale.y = 1.15;
  const coaming = add(body, new THREE.TorusGeometry(0.0235, 0.006, 8, 20), mat(0x7a4a2e, 0.7, 0, 0.1), 0, 0.026, -0.004);
  coaming.rotation.x = Math.PI / 2;
  coaming.scale.y = 1.15;
  const shield = add(body, new THREE.CylinderGeometry(0.021, 0.0235, 0.022, 14, 1, true, -0.95, 1.9), new THREE.MeshStandardMaterial({
    color: 0xcfeaff, roughness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
  }), 0, 0.04, 0.002);
  shield.rotation.x = -0.3;
  /* 机尾冒气的位置。 */
  const exhaust = new THREE.Object3D();
  exhaust.position.set(0, 0.004, -0.135);
  body.add(exhaust);

  /* 胡以沫：照她的照片做——头顶酒红色的毛绒发圈，刘海往两边分，米白卫衣带荷叶肩（咖色锁边），
     咖色小高领，藏青格子背带裙。她坐在座舱里，只露出上半身。 */
  const girl = new THREE.Group();
  girl.position.z = -0.004;
  body.add(girl);
  add(girl, new THREE.CylinderGeometry(0.019, 0.0225, 0.056, 16), cream, 0, 0.048, 0);
  add(girl, new THREE.CylinderGeometry(0.0206, 0.0237, 0.044, 18, 1, true), plaid, 0, 0.046, 0);
  for (const side of [-1, 1]) {
    for (const face of [-1, 1]) {
      add(girl, new THREE.BoxGeometry(0.0078, 0.014, 0.0025), plaid, side * 0.011, 0.0725, face * 0.0168).rotation.x = face * -0.42;
    }
    const flounce = new THREE.Group();
    flounce.position.set(side * 0.0245, 0.0735, 0);
    flounce.rotation.z = side * 0.95;
    add(flounce, new THREE.ConeGeometry(0.0225, 0.009, 9, 1, true), ruffle);
    add(flounce, new THREE.TorusGeometry(0.0225, 0.0017, 5, 9), brown, 0, -0.0045, 0).rotation.x = Math.PI / 2;
    girl.add(flounce);
  }
  add(girl, new THREE.BoxGeometry(0.006, 0.0015, 0.001), mat(0xd8dbe0, 0.3, 0.8, 0.1), 0, 0.056, 0.0226);
  add(girl, new THREE.TorusGeometry(0.0135, 0.0032, 6, 16), cream, 0, 0.0775, 0).rotation.x = Math.PI / 2;
  add(girl, new THREE.CylinderGeometry(0.0098, 0.011, 0.011, 12), brown, 0, 0.083, 0);
  add(girl, new THREE.TorusGeometry(0.0102, 0.002, 5, 12), brown, 0, 0.0885, 0).rotation.x = Math.PI / 2;
  /* 袖子和手：以肩为轴。arms[0] 在 −x，arms[1] 在 +x；平时扶着座舱边，打招呼时举起 +x 那只。 */
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.0255, 0.069, 0);
    add(arm, new THREE.CylinderGeometry(0.0085, 0.0108, 0.04, 10), cream, 0, -0.02, 0);
    add(arm, new THREE.TorusGeometry(0.0088, 0.002, 5, 10), cream, 0, -0.04, 0).rotation.x = Math.PI / 2;
    add(arm, new THREE.SphereGeometry(0.0078, 10, 8), skin, 0, -0.046, 0);
    arm.rotation.set(-1, 0, side * 0.2);
    girl.add(arm);
    return arm;
  });

  const head = new THREE.Group();
  head.position.set(0, 0.132, 0.001);
  girl.add(head);
  add(head, new THREE.SphereGeometry(0.042, 24, 18), skin, 0, 0, 0, true).scale.set(1, 0.95, 0.96);
  add(head, new THREE.SphereGeometry(0.0445, 24, 14, 0, TAU, 0, Math.PI * 0.5), hairMat, 0, 0.001, -0.002).rotation.x = -0.5;
  add(head, new THREE.SphereGeometry(0.0441, 24, 14, 0, TAU, 0, Math.PI * 0.5), hairMat, 0, 0, -0.003).rotation.x = -1.4;
  /* 头顶的小发髻和发圈（两团毛绒球），再翘出几根碎发。 */
  add(head, new THREE.SphereGeometry(0.0125, 12, 10), hairMat, 0, 0.0445, -0.012);
  add(head, new THREE.SphereGeometry(0.0062, 8, 6), scrunchie, 0, 0.0478, -0.003);
  for (const [x, y, z, tilt, lean] of [[-0.027, 0.043, 0.004, 0.3, 1.0], [0.029, 0.041, -0.002, -0.2, -1.15]]) {
    add(head, new THREE.CylinderGeometry(0.0006, 0.0003, 0.016, 4), hairMat, x, y, z).rotation.set(tilt, 0, lean);
  }
  const eyes = [];
  for (const side of [-1, 1]) {
    const puff = add(head, new THREE.SphereGeometry(0.0125, 12, 9), scrunchie, side * 0.0135, 0.046, -0.006);
    puff.scale.set(1.25, 0.82, 0.9);
    puff.rotation.z = side * -0.3;
    /* 中分的刘海贴着额头往两边撇，耳朵前面各垂下一缕。 */
    const bang = add(head, new THREE.SphereGeometry(0.02, 12, 8), hairMat, side * 0.0225, 0.0235, 0.0312);
    bang.scale.set(1, 0.42, 0.3);
    bang.rotation.set(0, side * 0.55, side * -0.82);
    add(head, new THREE.CylinderGeometry(0.003, 0.0012, 0.04, 6), hairMat, side * 0.0372, -0.012, 0.018).rotation.set(0.1, 0, side * 0.1);
    add(head, new THREE.SphereGeometry(0.0085, 10, 8), skin, side * 0.0405, -0.003, -0.002).scale.set(0.55, 1, 0.8);
    /* 眼睛放在一个小组里，眨眼时把整组压扁。 */
    const eye = new THREE.Group();
    eye.position.set(side * 0.0152, -0.0005, 0.0365);
    add(eye, new THREE.SphereGeometry(0.0062, 12, 10), ink).scale.set(1, 1.12, 0.5);
    add(eye, new THREE.SphereGeometry(0.0019, 8, 6), mat(0xffffff, 0.3, 0, 0.8), 0.0022, 0.0031, 0.0031);
    head.add(eye);
    eyes.push(eye);
    add(head, new THREE.BoxGeometry(0.0105, 0.0016, 0.0016), ink, side * 0.0155, 0.0128, 0.0372).rotation.z = side * -0.07;
    const blush = add(head, new THREE.CircleGeometry(0.0068, 14), new THREE.MeshBasicMaterial({ color: 0xf58f93, transparent: true, opacity: 0.5 }), side * 0.0262, -0.0112, 0.0338);
    blush.rotation.y = side * 0.62;
  }
  /* 咧着嘴笑，露出一排小白牙。 */
  const mouth = add(head, new THREE.CircleGeometry(0.0092, 16, Math.PI, Math.PI), mat(0x8e3038, 0.7, 0, 0.12), 0, -0.0118, 0.0388);
  add(head, new THREE.BoxGeometry(0.0125, 0.0026, 0.0008), mat(0xffffff, 0.4, 0, 0.5), 0, -0.0133, 0.0391);

  /* 比飞机大一圈的隐形球：手机上好点、好拖。 */
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = PIVOT + 0.03;
  root.add(hit);
  root.visible = false; /* 第一帧 update 之后才出现 */
  scene.add(root);

  /* 飞的时候机尾留下一串小云朵。 */
  const puffCanvas = document.createElement("canvas");
  puffCanvas.width = puffCanvas.height = 64;
  const puffContext = puffCanvas.getContext("2d");
  const puffGradient = puffContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  puffGradient.addColorStop(0, "rgba(255,255,255,1)");
  puffGradient.addColorStop(0.5, "rgba(255,255,255,.55)");
  puffGradient.addColorStop(1, "rgba(255,255,255,0)");
  puffContext.fillStyle = puffGradient;
  puffContext.fillRect(0, 0, 64, 64);
  const puffTexture = new THREE.CanvasTexture(puffCanvas);
  const puffs = Array.from({ length: 7 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    sprite.raycast = () => {};
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  });
  const history = [];
  let puffAt = 0;
  let flying = 0;

  /* ---- 状态 */
  const BASE = 0.85;
  const CRUISE = 0.52; /* 巡航速度，米 / 秒 */
  const PARK_PITCH = -0.27; /* 停稳时是后三点的姿态：机头翘着，尾橇着地 */
  const PARK_DROP = 0.011;
  /* 她飞的空域：比房间小一圈，离地、离桌面都留出高度。 */
  const air = new THREE.Box3(
    V(bounds.min.x + 0.35, 1.14, bounds.min.z + 0.32),
    V(bounds.max.x - 0.35, Math.min(bounds.max.y - 0.12, 2.02), Math.min(bounds.max.z, 0.85)), /* 再高就飞到导航栏后面去了 */
  );
  const home = air.clampPoint((perches.window?.pos.clone() || V(0.3, 1.58, -1.4)).add(V(0.25, 0.16, 0.42)), V());
  /* 调试用：网址带 ?yimo=park 时她一直停在录音机顶上，?yimo=hold 时一直悬停在窗前，
     ?yimo=near 时一直悬停在镜头正前方半米处（看脸和衣服的细节）。 */
  const forced = (() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get("yimo");
      return ["park", "hold", "near"].includes(wanted) ? wanted : null;
    } catch {
      return null;
    }
  })();
  const st = {
    pos: home.clone(), yaw: -1.1, pitch: 0, roll: 0, speed: 0, mode: "hold", at: null,
    show: 0, showGoal: 1, away: false, roam: !reducedMotion && !forced, escort: false,
    ground: 0, hold: 0.8, dwell: 0, talking: false, propSpeed: 30, headYaw: 0, blink: 2.5, wave: 0,
    sinceLand: 0, laps: 0, turn: 1, angle: 0, lastPad: null, climb: false,
  };
  if (forced === "park" && perches.music) {
    Object.assign(st, { mode: "parked", at: "music", ground: 1, propSpeed: 3 });
    st.pos.copy(perches.music.pos);
  }
  let path = null;
  let emote = null;
  let boss = null;
  const drag = { plane: new THREE.Plane(), offset: V(), target: V(), point: V(), normal: V(), sway: 0, lastX: 0 };
  const tangent = V();
  const tail = V();
  const projected = V();
  const heading = (out) => out.set(Math.sin(st.yaw), 0, Math.cos(st.yaw));
  const wrap = (angle) => ((((angle % TAU) + TAU + Math.PI) % TAU) - Math.PI);
  const towardCamera = () => Math.atan2(camera.position.x - st.pos.x, camera.position.z - st.pos.z);
  /* 这个点访客现在看得见吗（留一点边）。 */
  const inView = (point) => {
    projected.copy(point).project(camera);
    return projected.z < 1 && Math.abs(projected.x) < 0.82 && projected.y > -0.6 && projected.y < 0.8;
  };

  /* 飞一段：三次贝塞尔，从现在的机头方向滑出去，沿 into 进到终点。pad 不为空就是降落到那个落脚点。 */
  function fly(to, { pad = null, into = null } = {}) {
    const from = st.pos.clone();
    const distance = Math.max(0.05, from.distanceTo(to));
    const reach = clamp(distance * 0.45, 0.14, 0.75);
    const c1 = heading(V()).multiplyScalar(reach).add(from);
    if (st.mode === "parked") c1.y += 0.03; /* 先在落脚点上滑一小段再拉起来 */
    const inward = into ? into.clone() : to.clone().sub(from).setY(0);
    if (inward.lengthSq() < 1e-6) heading(inward);
    inward.normalize();
    const c2 = to.clone().addScaledVector(inward, -reach);
    if (pad) c2.y += 0.06 + distance * 0.06; /* 降落是从上面缓缓下来 */
    path = { from, c1, c2, to: to.clone(), t: 0, pad };
    st.mode = "cruise";
    st.at = null;
  }

  /* 空中的下一个去处：某个落脚点的上前方。十次里七次挑访客这会儿看得见的地方。 */
  function airPoint(high = false) {
    const ids = Object.keys(perches);
    const wantSeen = Math.random() < 0.72;
    let pick = null;
    for (let i = 0; i < 8; i += 1) {
      const base = perches[ids[Math.floor(Math.random() * ids.length)]].pos;
      const point = V(base.x + (Math.random() - 0.5) * 0.7, base.y + 0.3 + Math.random() * 0.5, base.z + 0.2 + Math.random() * 0.5);
      if (high) point.y = air.max.y;
      air.clampPoint(point, point);
      /* 越低越靠前，免得钻进桌上的东西里。 */
      point.z = Math.max(point.z, lerp(-0.7, air.min.z, clamp((point.y - 1.2) / 0.45, 0, 1)));
      /* 往高处躲也要躲在看得见的地方：从最高处一点点降，直到不被顶上的导航栏挡住。 */
      for (let drop = 0; high && drop < 8 && !inView(point); drop += 1) point.y -= 0.08;
      if (point.distanceTo(st.pos) < 0.45) continue;
      pick = point;
      if (high ? inView(point) : !wantSeen || inView(point)) break;
    }
    return pick || home.clone();
  }

  /* 绕着何鹏远小人转圈时的下一个点，以及进这个点时该朝的方向（圆的切线）。 */
  function orbitPoint(radius, lift) {
    st.angle += st.turn * (1.25 + Math.random() * 0.5);
    const centre = boss.pos;
    const point = V();
    /* 他站得高、镜头又凑得近时，绕在他头顶就出画了：一档一档往下试，直到访客看得见她。 */
    for (const drop of [0, 0.18, 0.36, 0.54]) {
      point.set(centre.x + Math.cos(st.angle) * radius, centre.y + lift - drop, centre.z + Math.sin(st.angle) * radius * 0.75 + 0.12);
      air.clampPoint(point, point);
      if (inView(point)) break;
    }
    return [point, V(-Math.sin(st.angle) * st.turn, 0, Math.cos(st.angle) * st.turn)];
  }

  function freePad() {
    const options = PADS.filter((id) => perches[id] && id !== boss?.at && id !== st.lastPad);
    const seen = options.filter((id) => inView(perches[id].pos));
    const pool = seen.length && Math.random() < 0.8 ? seen : options;
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  /* 接下来干什么：护航（带逛时）、绕着他转两圈、找个地方降落，或者接着飞。 */
  function next() {
    if (!st.roam) {
      st.mode = "hold";
      st.hold = Infinity;
      return;
    }
    st.sinceLand += 1;
    if (st.climb) {
      st.climb = false;
      fly(airPoint(true));
      return;
    }
    const near = Boolean(boss?.visible);
    if (near && (st.escort || st.laps > 0)) {
      st.laps = Math.max(0, st.laps - 1);
      /* 绕在他肩膀到头顶这一圈：再高，镜头凑近物件时就看不见她了。 */
      const [point, into] = orbitPoint(st.escort ? 0.4 : 0.34, st.escort ? 0.24 : 0.3);
      fly(point, { into });
      return;
    }
    const dice = Math.random();
    if (dice < 0.24 && st.sinceLand > 2) {
      const id = freePad();
      if (id) {
        /* 多半贴着墙的方向进场：台面都是横着宽、前后窄。 */
        const to = perches[id].pos;
        const into = to.clone().sub(st.pos).setY(0);
        into.x += Math.sign(into.x || 1) * into.length() * 0.6;
        into.z *= 0.5;
        fly(to, { pad: id, into });
        return;
      }
    }
    if (dice > 0.72 && near) {
      st.turn = Math.random() < 0.5 ? 1 : -1;
      st.angle = Math.atan2(st.pos.z - boss.pos.z, st.pos.x - boss.pos.x);
      st.laps = 2 + Math.floor(Math.random() * 2);
      next();
      return;
    }
    fly(airPoint());
  }

  function arrive() {
    const done = path;
    path = null;
    st.pos.copy(done.to);
    if (!done.pad) {
      next();
      return;
    }
    Object.assign(st, { mode: "parked", at: done.pad, lastPad: done.pad, sinceLand: 0, speed: 0, dwell: 5 + Math.random() * 5 });
    emit({ type: "land", id: done.pad });
  }

  /* 原地悬停一会儿（说话、刚被放下）：不在落脚点上、也没被拎着时才用得着。 */
  function holdFor(seconds) {
    if (st.mode === "parked" || st.mode === "drag") return;
    path = null;
    st.mode = "hold";
    st.hold = seconds;
  }

  /* ---- 被拎着走：在正对镜头、过飞机的那个平面里跟着手指。 */
  function grab(ray) {
    path = null;
    camera.getWorldDirection(drag.normal);
    drag.point.copy(st.pos);
    drag.point.y += 0.1 * root.scale.y;
    drag.plane.setFromNormalAndCoplanarPoint(drag.normal, drag.point);
    if (ray.intersectPlane(drag.plane, drag.point)) drag.offset.subVectors(drag.point, st.pos);
    else drag.offset.set(0, 0, 0);
    drag.target.copy(st.pos);
    drag.lastX = st.pos.x;
    st.mode = "drag";
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
    st.mode = "hold"; /* 松手先稳一稳，再接着飞 */
    st.hold = 2.2;
    emit({ type: "drop" });
  }

  /* ---- 每帧 */
  function update(dt, realDt, time) {
    const step = Math.min(realDt, 0.1);
    st.show = approach(st.show, st.showGoal && !st.away ? 1 : 0, step / 0.22);
    root.visible = st.show > 0.01;
    if (!root.visible) {
      for (const sprite of puffs) sprite.visible = false;
      return;
    }
    const before = st.yaw;
    let yawGoal = null;
    let pitchGoal = 0;
    if (forced === "near" && st.mode === "hold") {
      camera.getWorldDirection(st.pos).multiplyScalar(0.5).add(camera.position);
      st.pos.y -= 0.1;
    }

    if (st.mode === "drag") {
      st.pos.lerp(drag.target, 1 - Math.exp(-step * 18));
      drag.sway = lerp(drag.sway, clamp((st.pos.x - drag.lastX) / Math.max(step, 0.001) * -0.5, -0.7, 0.7), 1 - Math.exp(-step * 8));
      drag.lastX = st.pos.x;
      st.speed = 0;
    } else if (st.mode === "cruise" && path) {
      /* 沿航线匀速走：按这一点上曲线的“快慢”换算参数的步子。降落到最后慢下来。 */
      /* 护航时落得远了就加速追。 */
      let want = CRUISE * (!st.escort ? 1 : boss && st.pos.distanceTo(boss.pos) > 0.9 ? 2.1 : 1.3);
      if (path.pad) want *= lerp(0.3, 1, smoothstep(st.pos.distanceTo(path.to), 0.04, 0.5)); /* 只在最后半米减速 */
      st.speed = approach(st.speed, want, step * (st.escort ? 1.8 : 0.9));
      const slope = (t) => {
        const a = 3 * (1 - t) * (1 - t);
        const b = 6 * (1 - t) * t;
        const c = 3 * t * t;
        return tangent.set(
          a * (path.c1.x - path.from.x) + b * (path.c2.x - path.c1.x) + c * (path.to.x - path.c2.x),
          a * (path.c1.y - path.from.y) + b * (path.c2.y - path.c1.y) + c * (path.to.y - path.c2.y),
          a * (path.c1.z - path.from.z) + b * (path.c2.z - path.c1.z) + c * (path.to.z - path.c2.z),
        );
      };
      path.t = Math.min(1, path.t + (Math.max(st.speed, 0.08) * step) / Math.max(slope(path.t).length(), 0.08));
      const t = path.t;
      const a = (1 - t) ** 3;
      const b = 3 * (1 - t) * (1 - t) * t;
      const c = 3 * (1 - t) * t * t;
      const d = t ** 3;
      st.pos.set(
        a * path.from.x + b * path.c1.x + c * path.c2.x + d * path.to.x,
        a * path.from.y + b * path.c1.y + c * path.c2.y + d * path.to.y,
        a * path.from.z + b * path.c1.z + c * path.c2.z + d * path.to.z,
      );
      slope(t);
      const level = Math.hypot(tangent.x, tangent.z);
      if (level > 1e-4) yawGoal = Math.atan2(tangent.x, tangent.z);
      pitchGoal = clamp(-Math.atan2(tangent.y, Math.max(level, 1e-4)) * 0.9, -0.6, 0.6);
      if (t >= 1) arrive();
    } else if (st.mode === "hold") {
      /* 悬停：带着余速往前滑一小段，慢慢转过来侧对着镜头。 */
      st.speed = approach(st.speed, 0, step * 1.6);
      st.pos.addScaledVector(heading(tangent), st.speed * step);
      bounds.clampPoint(st.pos, st.pos);
      yawGoal = towardCamera() - 0.55;
      st.hold -= step;
      if (st.hold <= 0 && !st.talking) next();
    } else if (st.mode === "parked") {
      yawGoal = towardCamera() - 0.6;
      if (!st.talking) st.dwell -= step;
      if (st.dwell <= 0 && st.roam) fly(airPoint());
    } else {
      next();
    }

    const cruising = st.mode === "cruise";
    if (yawGoal !== null) st.yaw = turnToward(st.yaw, yawGoal, 1 - Math.exp(-step * (cruising ? 9 : 3.5)));
    const yawRate = (st.yaw - before) / Math.max(step, 0.001);
    const pace = clamp(st.speed / CRUISE, 0, 1);
    /* 转弯时往里压坡度：转得越急压得越多。 */
    st.roll = lerp(st.roll, clamp(-yawRate * 0.24, -0.8, 0.8) * pace, 1 - Math.exp(-step * 5));
    st.pitch = lerp(st.pitch, pitchGoal, 1 - Math.exp(-step * 5));
    st.ground = approach(st.ground, st.mode === "parked" ? 1 : 0, step / 0.45);

    /* 表情动作：空中打个横滚，停着时晃晃翅膀、蹦一下。 */
    let spin = 0;
    let waggle = 0;
    let hop = 0;
    if (emote) {
      emote.t = Math.min(1, emote.t + step / emote.duration);
      if (emote.name === "roll") spin = TAU * easeInOut(emote.t) * emote.sign;
      else {
        waggle = Math.sin(emote.t * 22) * 0.28 * (1 - emote.t);
        hop = Math.sin(Math.PI * emote.t) * 0.03;
      }
      if (emote.t >= 1) emote = null;
    }

    const scale = BASE * lerp(1, 1.3, host.narrow) * easeInOut(st.show);
    const grounded = easeInOut(st.ground);
    const dragging = st.mode === "drag";
    const bob = Math.sin(time * 2.3) * 0.01 * (1 - grounded) * (1 - pace * 0.6);
    root.scale.setScalar(scale);
    root.position.set(st.pos.x, st.pos.y + (bob + hop) * scale, st.pos.z);
    root.rotation.y = st.yaw;
    body.position.y = PIVOT - PARK_DROP * grounded;
    body.rotation.set(
      lerp(st.pitch, PARK_PITCH, grounded) + (dragging ? Math.sin(time * 7) * 0.12 : 0),
      0,
      st.roll * (1 - grounded) + spin + waggle + (dragging ? drag.sway : 0),
    );

    /* 螺旋桨：停着时慢慢转，飞起来快到只剩一圈影子，被拎起来时急得飞转。 */
    const revs = st.mode === "parked" ? (st.talking ? 7 : 3.5) : dragging ? 46 : 26 + pace * 16;
    st.propSpeed = lerp(st.propSpeed, revs, 1 - Math.exp(-step * 2.5));
    prop.rotation.z += st.propSpeed * step;
    blur.material.opacity = clamp((st.propSpeed - 12) / 22, 0, 1) * 0.2;

    /* 人：朝镜头看（背对镜头时就看前面），说话时点头、张嘴，隔几秒眨一下眼。 */
    const k = 1 - Math.exp(-step * 12);
    const aside = wrap(towardCamera() - st.yaw);
    const look = Math.abs(aside) > 2.3 ? 0 : clamp(aside, -1, 1) * (cruising ? 0.7 : 1);
    st.headYaw = lerp(st.headYaw, look, 1 - Math.exp(-step * 6));
    head.rotation.set(
      st.talking ? Math.sin(time * 9) * 0.06 : 0,
      st.headYaw,
      Math.sin(time * 1.1) * 0.05 + (dragging ? Math.sin(time * 10) * 0.14 : 0),
    );
    st.wave = Math.max(0, st.wave - step);
    const flail = dragging ? Math.sin(time * 13) * 0.3 : 0;
    arms[0].rotation.x = lerp(arms[0].rotation.x, dragging ? 0 : -1, k);
    arms[0].rotation.z = lerp(arms[0].rotation.z, dragging ? -2.5 + flail : -0.2, k);
    arms[1].rotation.x = lerp(arms[1].rotation.x, dragging || st.wave > 0 ? 0 : -1, k);
    arms[1].rotation.z = lerp(arms[1].rotation.z, dragging ? 2.5 - flail : st.wave > 0 ? 2.35 + Math.sin(time * 15) * 0.35 : 0.2, k);
    st.blink -= step;
    if (st.blink < -0.12) st.blink = 2.4 + Math.random() * 3;
    for (const eye of eyes) eye.scale.y = lerp(eye.scale.y, st.blink < 0 ? 0.12 : 1, 1 - Math.exp(-step * 40));
    mouth.scale.y = st.talking ? 0.7 + Math.abs(Math.sin(time * 10)) * 0.5 : 1;

    /* 机尾的小云朵：只在飞的时候留下，越往后越大、越淡。 */
    const moving = cruising && st.speed > 0.2;
    flying = lerp(flying, moving ? 1 : 0, 1 - Math.exp(-step * 5));
    puffAt -= step;
    if (moving && puffAt <= 0) {
      puffAt = 0.09;
      exhaust.getWorldPosition(tail);
      history.unshift(tail.clone());
      history.length = Math.min(history.length, puffs.length);
    }
    puffs.forEach((sprite, index) => {
      const point = history[index];
      sprite.visible = Boolean(point) && flying > 0.02;
      if (!sprite.visible) return;
      const age = index / puffs.length;
      sprite.position.copy(point);
      sprite.position.y += age * 0.03;
      sprite.scale.setScalar((0.035 + age * 0.06) * scale);
      sprite.material.opacity = flying * (1 - age) * 0.32;
    });

    actor.onFrame?.();
  }

  const actor = {
    pickRoot: root,
    onFrame: null,
    get visible() {
      return st.showGoal > 0 && !st.away && root.visible;
    },
    get at() {
      return st.at;
    },
    update,
    grab,
    dragTo,
    drop,
    tap: () => emit({ type: "tap" }),
    /* roll：空中打个横滚（停着或被拎着时改成晃翅膀）；waggle：晃晃翅膀。 */
    emote(name) {
      const rolling = name === "roll" && st.mode !== "parked" && st.mode !== "drag" && !reducedMotion;
      emote = { name: rolling ? "roll" : "waggle", t: 0, duration: rolling ? 0.8 : 0.7, sign: Math.random() < 0.5 ? 1 : -1 };
    },
    wave(seconds = 1.6) {
      st.wave = seconds;
    },
    /* 说话时原地悬停（或者接着停在落脚点上），说完再飞。 */
    talk(on) {
      st.talking = Boolean(on);
      if (on) holdFor(Infinity);
      else if (st.mode === "hold") st.hold = Math.min(st.hold, 0.4);
      else if (st.mode === "parked") st.dwell = Math.max(st.dwell, 1.2);
    },
    /* 跟着谁：何鹏远小人（要它的 pos、at、visible）。 */
    follow(leader) {
      boss = leader;
    },
    /* 带逛时一路绕着他飞。 */
    escort(on) {
      st.escort = Boolean(on);
      if (!on) return;
      st.laps = 0;
      if (boss) st.angle = Math.atan2(st.pos.z - boss.pos.z, st.pos.x - boss.pos.x);
      if (st.mode === "parked" && st.roam) st.dwell = 0;
    },
    /* 正要降落的那个落脚点（没在降落就是 null）。 */
    get target() {
      return path?.pad || null;
    },
    /* 让位：停着的话马上起飞；正往那儿降落的话改去别处。 */
    scram() {
      if (!st.roam) return;
      if (st.mode === "parked") st.dwell = 0;
      else if (path?.pad) fly(airPoint());
    },
    /* 说完这句往高处飞。 */
    climb() {
      st.climb = true;
    },
    setVisible(on) {
      st.showGoal = on ? 1 : 0;
    },
    /* 在放映角看片时她不出来，免得从幕布前面飞过去。 */
    setAway(on) {
      st.away = Boolean(on);
    },
    reset() {
      path = null;
      emote = null;
      history.length = 0;
      if (forced === "park") return;
      Object.assign(st, { mode: "hold", hold: 0.8, at: null, speed: 0, ground: 0, showGoal: 1, escort: false, laps: 0, climb: false, talking: false });
      st.pos.copy(home);
    },
    /* 头顶在页面上的位置（像素）和她在屏幕上有多高，气泡跟着它。 */
    screen() {
      projected.copy(root.position).project(camera);
      const feet = (-projected.y * 0.5 + 0.5) * host.height;
      projected.copy(root.position);
      projected.y += 0.26 * root.scale.y;
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
      path = null;
      scene.remove(root, ...puffs);
      root.traverse((node) => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
      for (const sprite of puffs) sprite.material.dispose();
      plaidTexture.dispose();
      puffTexture.dispose();
    },
  };
  return actor;
}

/* ------------------------------------------------------------------ 出声：一个角色一个复用的 Audio */

/* 只播本人录音。url(id) 给出文件地址，has(id) 说这句有没有录音，muted() 是两个角色共用的静音开关，
   changed() 在“开始出声 / 没放出来”时调用，让气泡更新它的声音按钮。
   iPhone 的 Safari 和微信只允许在“点按”事件（touchend / click / 按键）里开始出声；同一个 Audio 放出过一次，
   之后不在点按里也能接着说（带逛、她接他的话），所以每个角色一直复用自己的那一个。 */
function createVoice({ url, has, muted, changed }) {
  let audio = null;
  let end = null; /* 结束当前这句录音：播完、出错或被打断时调用 */
  const warmed = new Set();
  const voice = {
    primed: false, /* 这个 Audio 已经真的放出过声音：之后不在点按里也能接着播 */
    trouble: null, /* 当前这句没放出来：{ why, sure }。sure = 是在气泡按钮的点击里试的，不是时机问题 */
    speech: Promise.resolve(false), /* 当前这句录音；播完得到 true，没播成或被打断得到 false */
    /* 这会儿正有一句在说（或者正等着开口）。 */
    get busy() {
      return end !== null;
    },
    can: (id) => !muted() && has(id),
    /* 把接下来多半要说的那句先拉进浏览器缓存，轮到它时不用等下载。访客点过小人之后才会调用。 */
    warm(id) {
      if (!voice.can(id) || warmed.has(id)) return;
      warmed.add(id);
      fetch(url(id)).catch(() => {});
    },
    quiet() {
      audio?.pause();
      end?.(false);
    },
    /* 没有录音或已静音就返回 null，只出文字。返回的 Promise 在这句结束时兑现（播完为 true）。
       sure：这次是在气泡按钮的点击里调用的。 */
    speak(id, sure = false) {
      voice.quiet();
      voice.trouble = null;
      if (!voice.can(id)) return null;
      audio ||= new Audio();
      audio.src = url(id);
      voice.speech = new Promise((resolve) => {
        let timer = 0;
        let tries = 0;
        const finish = (played) => {
          if (end !== finish) return;
          end = null;
          window.clearTimeout(timer);
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
          audio.removeEventListener("playing", onPlaying);
          resolve(played === true);
        };
        /* 没放出来：记下原因，气泡里的声音按钮变成「点这里出声」（那个按钮的点击一定算点按）。 */
        const fail = (why) => {
          if (end !== finish) return;
          voice.trouble = { why, sure };
          finish(false);
          changed();
        };
        const onEnded = () => finish(true);
        const onError = () => fail(`E${audio.error?.code ?? 0}`);
        /* 开始出声了：限时改成“这句剩下的长度 + 余量”。最长的一句有 17 秒多，网络慢、晚几秒才开口时，
           开头定的 20 秒会在它说完之前到点，带逛就把它掐断去下一站了；中途卡住又接上时，也按剩下的长度重算。 */
        const onPlaying = () => {
          if (end !== finish) return;
          window.clearTimeout(timer);
          const left = Number.isFinite(audio.duration) ? audio.duration - audio.currentTime : 30;
          timer = window.setTimeout(() => fail("timeout"), (Math.max(0, left) + 8) * 1000);
        };
        /* 可以试不止一次：第一次不在点按里被拦下，紧接着的 touchend / click 里再试（见 prime）。只认最后一次的结果。 */
        finish.retry = () => {
          const mine = ++tries;
          let started = null;
          try {
            started = audio.play();
          } catch (error) {
            fail(error?.name || "error");
            return;
          }
          started?.then?.(
            () => {
              if (end !== finish) return;
              voice.primed = true;
              changed();
            },
            (error) => {
              if (mine !== tries || error?.name === "AbortError") return;
              fail(error?.name === "NotAllowedError" ? "blocked" : error?.name || "error");
            },
          );
        };
        end = finish;
        timer = window.setTimeout(() => fail("timeout"), 20000); /* 20 秒还没开口：网络卡住了，别让带逛一直等下去 */
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);
        audio.addEventListener("playing", onPlaying);
        finish.retry();
      });
      return voice.speech;
    },
    /* 房间里任何一次触摸、点击或按键，都顺手给这个 Audio 解锁（WebKit 在带用户手势的 load() / play() 里
       解除“必须点按才能出声”的限制）。这样点小人时即使 click 没按时到、走了 400ms 的后备路径，也还能出声。
       要是这时正有一句等着出声——拖起小人那声是手指移动时触发的，不算点按——就在这次点按里把它放出来。 */
    prime() {
      if (voice.primed || muted()) return;
      try {
        audio ||= new Audio();
        if (end?.retry) end.retry();
        else audio.load();
      } catch {
        /* 解不了锁也没关系：气泡里还有「点这里出声」。 */
      }
    },
  };
  return voice;
}

/* ------------------------------------------------------------------ 气泡、台词和带逛 */

export function start({ room, overlay, lang = "zh", coarse = false, openView = () => {}, act = () => {}, session = null }) {
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
  let muted = session?.get(MUTE_KEY) === "1"; /* 两个小人共用一个静音开关 */
  let lastLine = null; /* 当前气泡这句，「点这里出声」时再说一遍 */
  let said = 0;
  let introduced = false;
  let refocus = false;
  const taps = [];
  const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const turn = { greet: Math.floor(Math.random() * T.greet.length), swear: 0, grab: 0, drop: 0, cute: 0, rogue: 0, poke: 0 };
  /* 放映角也是可以到处看的房间视角：小人在那儿照样能点、能说话（带逛只从书桌视角开始）。 */
  const roomy = () => view === "desk" || view === "cinema";
  /* 这一站小人能替访客做的事（放映、拉灯绳）：气泡上多一个按钮。 */
  const stopButtons = (id, before = () => {}) => {
    const action = STOP_ACTIONS[id];
    return action ? [[T.ui[action[0]], () => {
      before();
      act(action[1]);
    }]] : [];
  };

  const actor = room.addActor(createActor, onEvent);
  if (!actor) {
    bubble.remove();
    return null;
  }

  /* 把一个气泡摆到说话的那个小人头顶：node 是气泡，p 是小人的 screen()，box 是气泡的宽高。两个小人共用。 */
  function put(node, p, box) {
    node.classList.toggle("is-off", !p.ok);
    if (!p.ok) return;
    let left = clamp(p.x - box.w / 2, 8, Math.max(8, p.width - box.w - 8));
    let top = p.y - box.h - 14;
    /* 头顶上放不下（小人站得太高）就放到它旁边；手机上两边也放不下，就放到脚下。别把它自己挡住。 */
    let side = "";
    if (top < 58) {
      const gap = p.tall * 0.45 + 16;
      if (p.x + gap + box.w + 8 <= p.width) {
        side = "is-right";
        left = p.x + gap;
      } else if (p.x - gap - box.w >= 8) {
        side = "is-left";
        left = p.x - gap - box.w;
      } else {
        side = "is-below";
      }
      top = side === "is-below"
        ? p.y + p.tall + 14
        : clamp(p.y + p.tall * 0.3 - box.h / 2, 58, Math.max(58, p.height - box.h - 70));
    }
    for (const name of ["is-right", "is-left", "is-below"]) node.classList.toggle(name, name === side);
    node.style.setProperty("--tail", `${Math.round(clamp(p.x - left, 18, box.w - 18))}px`);
    node.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }
  function place() {
    if (!bubble.hidden) put(bubble, actor.screen(), size);
  }
  actor.onFrame = place;

  /* ---- 本人录音：两个小人各有一个声音，各播各的文件（她的带 yimo- 前缀） */
  const bossVoice = createVoice({
    url: (id) => `${VOICE_DIR}${id}.mp3?v=${VOICE_REV}`,
    has: (id) => VOICE.has(id),
    muted: () => muted,
    changed: () => sound.show(),
  });
  const aideVoice = createVoice({
    url: (id) => `${VOICE_DIR}${AIDE_VOICE_PREFIX}${id}.mp3?v=${VOICE_REV}`,
    has: (id) => AIDE_VOICE.has(id),
    muted: () => muted,
    changed: () => aideSound?.show(),
  });
  /* 房间里任何一次触摸、点击或按键都给两个 Audio 解锁（见 createVoice 的 prime）；她还没有录音时不用管她的。 */
  const prime = () => {
    bossVoice.prime();
    if (AIDE_VOICE.size) aideVoice.prime();
  };
  const PRIME_EVENTS = ["touchend", "pointerup", "click", "keydown"];
  for (const type of PRIME_EVENTS) overlay.addEventListener(type, prime, { capture: true, passive: true });

  function setMuted(on) {
    muted = on;
    session?.set(MUTE_KEY, muted ? "1" : "0");
    if (muted) {
      bossVoice.quiet();
      aideVoice.quiet();
    }
    sound.show();
    aideSound?.show();
  }

  /* 有录音的台词，气泡里带一个声音按钮。平时是静音开关（访客可能在办公室或地铁上，本次会话内记住，两个小人一起静音）；
     这句没放出来时变成「点这里出声」，点它就在这次点击里把这句再说一遍（again）；连这样都放不出来，就写明原因，
     让访客截图就能定位（blocked = 被浏览器拦下，E4 = 文件放不了，timeout = 没下载下来）。
     node 是气泡，measure 在按钮文字变了之后重新量气泡的大小。两个小人的气泡各有一个。 */
  function soundControl(voice, node, again, measure) {
    let button = null;
    const show = () => {
      const { trouble } = voice;
      node.dataset.sound = trouble ? trouble.why : muted ? "muted" : voice.primed ? "on" : "";
      if (!button) return;
      const alert = Boolean(trouble) && !muted;
      button.classList.toggle("is-alert", alert);
      button.textContent = !alert
        ? muted ? T.ui.unmute : T.ui.mute
        : trouble.sure ? `${T.ui.noSound} · ${trouble.why}` : T.ui.tapSound;
      if (!node.hidden) measure();
    };
    /* 每换一句重做一个按钮；on = 这句有录音，没有录音的句子不带按钮。 */
    const make = (on) => {
      button = null;
      if (!on) return null;
      button = element("button", "say-b say-mute", muted ? T.ui.unmute : T.ui.mute);
      button.type = "button";
      button.addEventListener("click", () => {
        if (voice.trouble && !muted) again();
        else setMuted(!muted);
      });
      return button;
    };
    return { show, make };
  }
  const sound = soundControl(bossVoice, bubble, again, () => {
    size = { w: bubble.offsetWidth, h: bubble.offsetHeight };
  });
  let aideSound = null;

  /* ---- 助理胡以沫：坐小飞机的第二个小人，自己一个气泡（顶上带名字）。
     她只用她本人的录音出声（AIDE_VOICE），不借用何鹏远的；没录的句子只出文字。建不出来的话就只有何鹏远小人，别的不受影响。 */
  const A = AIDE_LINES[lang] || AIDE_LINES.zh;
  const aideTurn = { chat: Math.floor(Math.random() * A.chat.length), fuss: 0, held: 0, freed: 0, scold: 0, giveWay: 0, escort: 0, bossHeld: 0 };
  const aideTaps = [];
  const aideUi = {
    bubble: null, line: null, acts: null, size: { w: 0, h: 0 }, hide: 0, hello: 0,
    met: false, /* 自我介绍过了（文字也算） */
    heard: false, /* 那句自我介绍用她的声音说过了 */
    said: 0,
    last: null, /* 当前气泡这句，「点这里出声」时再说一遍 */
    cancel: null, /* 取消还没说出口的那句接话 */
    reacted: Promise.resolve(false), /* 最近一次接话；她说完（或没说）时兑现 */
  };
  let aide = null;
  try {
    aide = room.addActor(createAide, onAideEvent);
  } catch {
    aide = null;
  }
  if (aide) {
    aide.follow(actor);
    aideUi.bubble = element("div", "room-say is-aide");
    aideUi.bubble.hidden = true;
    aideUi.bubble.setAttribute("role", "status");
    aideUi.bubble.setAttribute("aria-live", "polite");
    aideUi.line = element("p", "say-t");
    aideUi.acts = element("div", "say-acts");
    aideUi.bubble.append(element("span", "say-who", A.who), aideUi.line, aideUi.acts);
    overlay.append(aideUi.bubble);
    aide.onFrame = () => {
      if (!aideUi.bubble.hidden) put(aideUi.bubble, aide.screen(), aideUi.size);
    };
    aideSound = soundControl(aideVoice, aideUi.bubble, aideAgain, () => {
      aideUi.size = { w: aideUi.bubble.offsetWidth, h: aideUi.bubble.offsetHeight };
    });
  }

  function aideHide() {
    window.clearTimeout(aideUi.hide);
    if (!aideUi.bubble || aideUi.bubble.hidden) return;
    aideVoice.quiet();
    if (aideUi.bubble.contains(document.activeElement)) overlay.focus({ preventScroll: true });
    aideUi.bubble.classList.remove("is-on");
    aideUi.bubble.hidden = true;
    aide.talk(false);
  }

  /* id 是这句的录音 id（hi、chat3……）；buttons: [文字, 回调, 是否主按钮]。她说话时飞机原地悬停，说完接着飞。
     有她本人的录音就出声，并返回 speak() 的 Promise；voice: false 是她自己冒出来的话，只出文字。 */
  function aideSay(id, text, { buttons = [], hold = 0, voice = true, sure = false } = {}) {
    if (!aide?.visible) return null;
    window.clearTimeout(aideUi.hide);
    const mine = ++aideUi.said;
    const spoken = voice ? aideVoice.speak(id, sure) : (aideVoice.quiet(), null);
    aideUi.last = { id, text, options: { buttons, hold, voice } };
    /* 换按钮之前先把焦点还给房间，否则焦点掉到 body 上，快捷键就失灵了。 */
    if (aideUi.bubble.contains(document.activeElement)) overlay.focus({ preventScroll: true });
    aideUi.line.textContent = text;
    aideUi.acts.replaceChildren(...buttons.map(([label, handler, main]) => {
      const button = element("button", main ? "say-b is-main" : "say-b", label);
      button.type = "button";
      button.addEventListener("click", handler);
      return button;
    }));
    const mute = aideSound.make(voice && AIDE_VOICE.has(id));
    if (mute) aideUi.acts.append(mute);
    aideUi.acts.hidden = aideUi.acts.childElementCount === 0;
    aideUi.bubble.hidden = false;
    aideSound.show();
    aideUi.size = { w: aideUi.bubble.offsetWidth, h: aideUi.bubble.offsetHeight };
    put(aideUi.bubble, aide.screen(), aideUi.size);
    requestAnimationFrame(() => aideUi.bubble.classList.add("is-on"));
    aide.talk(true);
    const perChar = /[㐀-鿿가-힯]/.test(text) ? 170 : 62;
    const until = performance.now() + (hold || clamp(2000 + text.length * perChar, 3000, 8000));
    /* 气泡至少留够读完的时间；有录音的话，还要等这句说完。 */
    const later = () => {
      aideUi.hide = window.setTimeout(aideHide, Math.max(spoken ? 600 : 0, until - performance.now()));
    };
    if (spoken) {
      spoken.then(() => {
        if (aideUi.said === mine && !aideUi.bubble.hidden) later();
      });
    } else {
      later();
    }
    return spoken;
  }

  function aideAgain() {
    const current = aideUi.last;
    if (current) aideSay(current.id, current.text, { ...current.options, sure: true });
  }

  /* [录音 id, 文字]：这一组里轮到的那句。 */
  const aideNext = (group) => {
    const index = aideTurn[group] % A[group].length;
    aideTurn[group] += 1;
    return [`${group}${index + 1}`, A[group][index]];
  };
  const aideWarm = (group) => aideVoice.warm(`${group}${(aideTurn[group] % A[group].length) + 1}`);

  /* 何鹏远小人那边出了什么事，她接一句（爆粗口、被拎起来、开始带逛、占了她的位置）。
     after 是他正在说的那句录音：等他说完她再开口，两个人不抢话；到时候 still() 为假（他已经换了一句、
     带逛已经停了）就不接了，他这会儿又在说别的就只出文字。
     返回的 Promise 在她这句说完时兑现（没接、只出文字或被取消时马上兑现）：带逛和耍赖靠它等她说完。 */
  function aideReact(group, { after = null, delay = 0, chance = 1, still = () => true, voice = true, hold = 2800 } = {}) {
    aideUi.cancel?.();
    if (!aide || Math.random() > chance) return Promise.resolve(false);
    const done = new Promise((resolve) => {
      let timer = 0;
      const cancel = () => {
        if (aideUi.cancel !== cancel) return;
        aideUi.cancel = null;
        window.clearTimeout(timer);
        resolve(false);
      };
      aideUi.cancel = cancel;
      const go = () => {
        if (aideUi.cancel !== cancel) return;
        timer = window.setTimeout(() => {
          if (aideUi.cancel !== cancel) return;
          aideUi.cancel = null;
          const spoken = roomy() && still()
            ? aideSay(...aideNext(group), { hold, voice: voice && !bossVoice.busy })
            : null;
          if (spoken) spoken.then(resolve);
          else resolve(false);
        }, delay);
      };
      if (after) after.then(go);
      else go();
    });
    aideUi.reacted = done;
    return done;
  }

  /* 她正在说（或正要接他的话）时，他等她说完再开口；最多等 6 秒，她的录音卡住也不耽误他。 */
  const afterAide = () => Promise.race([aideUi.reacted.then(() => aideVoice.speech), pause(6000)]);

  /* after：他那句“发车”的录音，她等他说完再喊“出发”。 */
  function aideTour(on, after = null) {
    if (!aide) return;
    aide.escort(on);
    if (!on) return;
    aideHide();
    aideWarm("escort");
    aideReact("escort", { after, delay: after ? 250 : 500, hold: 2000, still: () => Boolean(tour) });
  }

  function aidePoke() {
    if (!aide?.visible) return false;
    const now = performance.now();
    while (aideTaps.length && now - aideTaps[0] > 5000) aideTaps.shift();
    aideTaps.push(now);
    if (aideTaps.length >= 3) {
      /* 五秒里被戳三下以上：她不骂人，嘟囔一句，说完往高处飞。 */
      aideTaps.length = 0;
      aide.emote("waggle");
      aide.climb();
      aideSay(...aideNext("fuss"), { hold: 2600 });
      return true;
    }
    aide.emote("roll");
    aide.wave();
    const canTour = !tour && view === "desk";
    if (!aideUi.met || (!aideUi.heard && aideVoice.can("hi"))) {
      /* 进房间时那句自我介绍只出了文字；第一次被点，先用她自己的声音说一遍（有录音的话）。 */
      aideUi.met = true;
      aideUi.heard = true;
      aideSay("hi", A.hi, { buttons: canTour ? [tourButton()] : [] });
    } else {
      const index = aideTurn.chat % A.chat.length;
      aideSay(...aideNext("chat"), { buttons: index === TOUR_LINE && canTour ? [tourButton()] : [] });
    }
    aideWarm("chat");
    if (aideTaps.length === 2) aideWarm("fuss");
    return true;
  }

  function onAideEvent(event) {
    if (!roomy()) return;
    if (event.type === "tap") aidePoke();
    else if (event.type === "grab") aideSay(...aideNext("held"), { hold: 60000 });
    else if (event.type === "drop") aideSay(...aideNext("freed"));
  }

  /* 气泡里的按钮被换掉或收起时，焦点会掉到 body 上，房间的快捷键（Esc、V、G）就都收不到了：
     先把焦点还给房间。返回 true 表示焦点原本在气泡里，下一个气泡出来时把焦点放回它的主按钮。 */
  function releaseFocus() {
    if (!bubble.contains(document.activeElement)) return false;
    overlay.focus({ preventScroll: true });
    return true;
  }

  function hide() {
    window.clearTimeout(hideTimer);
    bossVoice.quiet();
    refocus = releaseFocus() || refocus;
    bubble.classList.remove("is-on");
    bubble.hidden = true;
    actor.talk(false);
  }

  /* 「点这里出声」：把当前这句在这次点击里再说一遍。 */
  function again() {
    const current = lastLine;
    if (!current) return;
    if (current.stop && tour === current.stop) {
      window.clearTimeout(tour.timer);
      sayStop(current.stop, true);
    } else {
      say(current.id, current.text, { ...current.options, sure: true });
    }
  }

  /* buttons: [文字, 回调, 是否主按钮]；counter: 带逛时的「3/10」。有录音就返回 speak() 的 Promise。 */
  function say(id, text, { buttons = [], counter = "", hold = 0, voice = true, sure = false } = {}) {
    window.clearTimeout(hideTimer);
    const mine = ++said;
    const spoken = voice ? bossVoice.speak(id, sure) : (bossVoice.quiet(), null);
    lastLine = { id, text, options: { buttons, counter, hold, voice }, stop: null };
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
    const mute = sound.make(voice && VOICE.has(id));
    if (mute) acts.append(mute);
    acts.hidden = acts.childElementCount === 0;
    bubble.hidden = false;
    sound.show();
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
    aideTour(false);
    room.highlight(null);
    actor.setRoam(true);
    if (sayBye) say("tourStop", T.tourStop);
    else hide();
    return true;
  }

  function finishTour() {
    window.clearTimeout(tour?.timer);
    tour = null;
    aideTour(false);
    room.highlight(null);
    room.setDeskView(0);
    actor.setRoam(true);
    actor.emote("jump");
    say("tourEnd", T.tourEnd);
  }

  /* 到站后说这一站的介绍，说完再去下一站；没出声（没录音、静音、浏览器不让播）就按读完文字的时间算。
     「点这里出声」重试时会再调用一次，所以只认最后一次说的那句。 */
  function sayStop(current, sure = false) {
    const { index } = current;
    const [id, , , target] = TOUR[index];
    const buttons = [[index + 1 < TOUR.length ? T.ui.next : T.ui.stop, () => tourStep(index + 1), true]];
    if (target) {
      buttons.push([T.ui.open, () => {
        stopTour();
        openView(target);
      }]);
    }
    buttons.push(...stopButtons(id, () => stopTour()));
    if (index + 1 < TOUR.length) buttons.push([T.ui.stop, () => stopTour(true)]);
    const shown = performance.now();
    const spoken = say(`stop-${id}`, T.stops[id], { buttons, counter: `${index + 1}/${TOUR.length}`, hold: 60000, sure });
    lastLine.stop = current;
    current.spoken = spoken;
    bossVoice.warm(index + 1 < TOUR.length ? `stop-${TOUR[index + 1][0]}` : "tourEnd");
    const advance = (played) => {
      if (tour !== current || current.spoken !== spoken) return;
      const since = performance.now() - shown;
      const rest = played ? Math.max(1400, 6000 - since) : Math.max(0, 7600 - since);
      current.timer = window.setTimeout(() => {
        if (tour === current) tourStep(index + 1);
      }, rest);
    };
    if (spoken) spoken.then(advance);
    else advance(false);
  }

  /* keep：上一句（“发车”）还在说，就别打断它——先飞着，等它说完再介绍这一站。 */
  function tourStep(index, keep = false) {
    if (index >= TOUR.length) {
      finishTour();
      return;
    }
    window.clearTimeout(tour?.timer);
    const current = (tour = { index, timer: 0, spoken: null });
    const [id, preset, hot] = TOUR[index];
    if (!keep) hide();
    room.setDeskView(preset);
    room.highlight(hot);
    bossVoice.warm(`stop-${id}`);
    const breath = keep ? bossVoice.speech.then(() => pause(450)) : bossVoice.speech;
    /* 到站了也先等她把话说完（她在喊“出发”，或者访客路上点了她），他再介绍这一站。 */
    Promise.all([actor.go(id), breath]).then(([arrived]) => afterAide().then(() => {
      if (tour === current && arrived) sayStop(current);
    }));
  }

  function startTour() {
    if (view !== "desk") return;
    stopTour();
    actor.setRoam(false);
    tour = { index: -1, timer: 0 };
    const current = tour;
    actor.emote("jump");
    aideTour(true, say("tourStart", T.tourStart, { hold: 1900 }));
    bossVoice.warm(`stop-${TOUR[0][0]}`);
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
      const swore = say(...next("swear"));
      const mine = said;
      /* 她听见了要管一句：等他骂完再开口（他没出声就按原来的间隔）。 */
      const scolded = aideReact("scold", { after: swore, delay: swore ? 300 : 1500, chance: 0.75, still: () => said === mine });
      bossVoice.warm(`rogue${(turn.rogue % T.rogue.length) + 1}`);
      /* 骂完往地上一躺，耍赖；骂的那句说完（她要是接了话，等她也说完）再接一句赖皮话——是访客戳出来的，可以出声。
         中间又被戳、开始带逛或离开书桌，就不接了。她的录音卡住时最多等 6 秒。 */
      actor.pose("tantrum", 8);
      const sulk = () => {
        if (said !== mine || tour || view !== "desk") return;
        actor.pose("tantrum", 4.6);
        say(...next("rogue"), { hold: 4200 });
      };
      if (swore) swore.then((played) => played && Promise.race([scolded, pause(6000)]).then(() => window.setTimeout(sulk, 350)));
      else window.setTimeout(sulk, 3000);
      return;
    }
    if (taps.length === 2) aideWarm("scold");
    turn.poke += 1;
    if (!introduced && bossVoice.can("hello")) {
      /* 进房间时那句招呼只出了文字（浏览器不让没点过的页面出声）；第一次被点，先用本人的声音把它说出来。 */
      introduced = true;
      actor.emote("wave");
      say("hello", T.hello, { buttons: [tourButton()] });
    } else if (turn.poke % 3 === 0) {
      /* 每戳三下里有一下不好好说话：撒娇。 */
      actor.pose("cute", 2.8);
      say(...next("cute"), { buttons: [tourButton()] });
    } else {
      actor.emote(turn.greet % 2 ? "wave" : "jump");
      say(...next("greet"), { buttons: [tourButton()] });
    }
    bossVoice.warm(`greet${(turn.greet % T.greet.length) + 1}`);
    if ((turn.poke + 1) % 3 === 0) bossVoice.warm(`cute${(turn.cute % T.cute.length) + 1}`);
    bossVoice.warm("tourStart");
  }

  function onEvent(event) {
    if (!roomy()) return;
    if (event.type === "tap") {
      poke();
    } else if (event.type === "grab") {
      stopTour();
      const yelped = say(...next("grab"), { hold: 60000 });
      const mine = said;
      /* 她替他喊一句：等他那声喊完；这时他已经被放下、在说别的了，就不喊了。 */
      aideReact("bossHeld", { after: yelped, delay: yelped ? 300 : 900, chance: 0.5, still: () => said === mine });
    } else if (event.type === "drop") {
      say(...next("drop"));
    } else if (event.type === "arrive" && aide && (aide.at === event.id || aide.target === event.id)) {
      /* 他落到了她停飞机（或正要降落）的地方：她让位，飞开一点再说话。 */
      const parked = aide.at === event.id;
      aide.scram();
      /* 这是他自己逛过来的，不是访客点出来的：只出文字。 */
      if (parked && !tour) aideReact("giveWay", { delay: 1100, voice: false });
    } else if (event.type === "arrive" && !tour && bubble.hidden) {
      const quietFor = performance.now() - lastSaid;
      const buttons = stopButtons(event.id);
      if (T.stops[event.id] && quietFor > 22000 && Math.random() < 0.5) {
        /* 自己逛到某件东西旁边时，偶尔介绍一句；不出声，也不太频繁。能替访客做的事（放映、拉灯绳）给个按钮。 */
        say(`stop-${event.id}`, T.stops[event.id], { hold: buttons.length ? 7000 : 4200, voice: false, buttons });
      } else if ((event.pose === "lie" || event.pose === "prone") && quietFor > 16000 && Math.random() < 0.4) {
        /* 落下来就躺着或趴着：赖一句。 */
        say(...next("rogue"), { hold: 3800, voice: false });
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

  /* 她也自我介绍一次（每次会话一次），排在何鹏远小人那句招呼后面；这时他要是还在说话，就再等等。 */
  const aideHello = (wait) => {
    aideUi.hello = window.setTimeout(() => {
      if (!aide || aideUi.met || session?.get(AIDE_HI_KEY) === "1") return;
      if (view !== "desk" || tour || !bubble.hidden || !aideUi.bubble.hidden) {
        aideHello(4000);
        return;
      }
      session?.set(AIDE_HI_KEY, "1");
      aideUi.met = true;
      aide.wave();
      aideSay("hi", A.hi, { voice: false });
    }, wait);
  };
  if (aide) aideHello(coarse ? 19000 : 13000);

  return {
    /* 启动器换视图时告诉这里：离开书桌就收起气泡、停止带逛。 */
    setView(nextView) {
      view = nextView;
      if (view !== "desk") {
        stopTour();
        hide();
        aideHide();
      }
      aide?.setAway(view === "cinema");
    },
    /* 书桌视角下的快捷键：G 带逛 / 停止，H 让它说话，Y 让助理胡以沫说话，Esc 停止带逛。处理了就返回 true。 */
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
      if (key === "y") return aidePoke();
      return key === "escape" ? stopTour(true) : false;
    },
    dispose() {
      window.clearTimeout(helloTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(tour?.timer);
      window.clearTimeout(aideUi.hide);
      window.clearTimeout(aideUi.hello);
      aideUi.cancel?.();
      tour = null;
      bossVoice.quiet();
      aideVoice.quiet();
      for (const type of PRIME_EVENTS) overlay.removeEventListener(type, prime, { capture: true });
      bubble.remove();
      aideUi.bubble?.remove();
      actor.onFrame = null;
      if (aide) aide.onFrame = null;
      aide = null;
    },
  };
}
