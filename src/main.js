import * as Phaser from "phaser";

const GAME_WIDTH = 1600;
const GAME_HEIGHT = 900;
const COURSE_WIDTH = 5600;
const FLOOR_Y = 760;
const PLAYER_RUN_SPEED = 300;
const PLAYER_JUMP_SPEED = -860;
const PLAYER_SHORT_HOP_SPEED = -360;
const PLAYER_JUMP_HOLD_MS = 120;
const PLAYER_JUMP_HOLD_FORCE = 26;
const PLAYER_BODY_HEIGHT = 46;
const PLAYER_BODY_OFFSET_Y = 2;
const PLAYER_SPRITE_HALF_HEIGHT = 24;
const PLAYER_SPAWN_X = 120;
const PLAYER_SPAWN_Y = FLOOR_Y - 36 - PLAYER_BODY_HEIGHT - PLAYER_BODY_OFFSET_Y + PLAYER_SPRITE_HALF_HEIGHT;
const FALL_LIMIT_Y = GAME_HEIGHT + 210;
const LEVEL_TIME_LIMIT = 50;
const FINAL_GROUND_X = COURSE_WIDTH - 1280;
const FINAL_GROUND_WIDTH = 1240;
const CONTAINER_TEXTURE_KEY = "containex-container";
const PLUS_LINE_GOAL_TEXTURE_KEY = "ctx-plus-line-goal";
const HIGH_SCORE_STORAGE_KEY = "containex-jump-high-score";
const CONTAINER_ASSET_WIDTH = 343;
const CONTAINER_ASSET_HEIGHT = 258;
const CONTAINER_ASPECT = CONTAINER_ASSET_HEIGHT / CONTAINER_ASSET_WIDTH;

const assetPath = (fileName) => `${import.meta.env.BASE_URL}${fileName}`;

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayKicker = document.getElementById("overlayKicker");
const restartButton = document.getElementById("restartButton");
const scoreNode = document.getElementById("score");
const highScoreNode = document.getElementById("highScore");
const levelNode = document.getElementById("level");
const timeNode = document.getElementById("time");
const livesNode = document.getElementById("lives");
const heartsNode = document.getElementById("hearts");

const runState = {
  score: 0,
  lives: 3,
  level: 1,
  highScore: loadHighScore(),
};

const touchState = {
  left: false,
  right: false,
  jump: false,
  jumpQueued: false,
};

let activeScene = null;

bindTouchButton("moveLeft", "left");
bindTouchButton("moveRight", "right");
bindTouchButton("jump", "jump", true);

restartButton.addEventListener("click", () => {
  hideOverlay();
  if (activeScene) {
    if (activeScene.levelCompleted && typeof activeScene.startNextLevel === "function") {
      activeScene.startNextLevel();
      return;
    }
    if (typeof activeScene.restartRun === "function") {
      activeScene.restartRun();
      return;
    }
    activeScene.scene.restart();
  }
});

function bindTouchButton(id, key, queue = false) {
  const button = document.getElementById(id);
  if (!button) {
    return;
  }

  const activate = (event) => {
    event.preventDefault();
    touchState[key] = true;
    if (queue) {
      touchState.jumpQueued = true;
    }
    button.classList.add("is-active");
  };

  const deactivate = (event) => {
    event.preventDefault();
    touchState[key] = false;
    button.classList.remove("is-active");
  };

  [
    ["pointerdown", activate],
    ["pointerup", deactivate],
    ["pointerleave", deactivate],
    ["pointercancel", deactivate],
    ["touchstart", activate],
    ["touchend", deactivate],
    ["touchcancel", deactivate],
  ].forEach(([name, handler]) => {
    button.addEventListener(name, handler, { passive: false });
  });
}

function syncHud({ score, highScore, level, timeLeft, lives, hearts }) {
  scoreNode.textContent = String(score).padStart(6, "0");
  highScoreNode.textContent = String(highScore).padStart(6, "0");
  levelNode.textContent = String(level);
  timeNode.textContent = String(timeLeft).padStart(3, "0");
  livesNode.textContent = `x${String(lives).padStart(2, "0")}`;
  heartsNode.innerHTML = "";
  for (let index = 0; index < 3; index += 1) {
    const heart = document.createElement("span");
    heart.className = `heart${index < hearts ? " is-on" : ""}`;
    heartsNode.appendChild(heart);
  }
}

function showOverlay(kicker, title, copy, buttonText = "↻") {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  restartButton.textContent = buttonText;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function loadHighScore() {
  try {
    const savedScore = window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    return Math.max(0, Number.parseInt(savedScore ?? "0", 10) || 0);
  } catch {
    return 0;
  }
}

function saveHighScore(score) {
  try {
    window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(score));
  } catch {
    // If storage is unavailable, the in-memory high score still works for this run.
  }
}

function resetRunState() {
  runState.score = 0;
  runState.lives = 3;
  runState.level = 1;
}

class ContainexJumpScene extends Phaser.Scene {
  constructor() {
    super("containex-jump");
  }

  preload() {
    this.load.image(CONTAINER_TEXTURE_KEY, assetPath("containex-container.png"));
    this.load.image(PLUS_LINE_GOAL_TEXTURE_KEY, assetPath("ctx-plus-line-goal.png"));
  }

  create() {
    activeScene = this;
    hideOverlay();
    createTextures(this);
    this.createWorld();
    this.createPlatforms();
    this.createCollectibles();
    this.createHazards();
    this.createGoal();
    this.createPlayer();
    this.createEffects();
    this.createCollisions();
    this.createTimer();
    this.resetState();
  }

  createWorld() {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x1987ff, 0x1987ff, 0x87d6ff, 0x87d6ff, 1);
    sky.fillRect(0, 0, COURSE_WIDTH, GAME_HEIGHT);

    this.clouds = [];
    [
      { x: 250, y: 240, scale: 1.25, speed: 0.045 },
      { x: 615, y: 165, scale: 0.9, speed: 0.03 },
      { x: 1360, y: 215, scale: 1.18, speed: 0.05 },
      { x: 860, y: 500, scale: 0.78, speed: 0.018 },
      { x: 2040, y: 188, scale: 1.08, speed: 0.035 },
      { x: 2790, y: 255, scale: 0.95, speed: 0.022 },
      { x: 3635, y: 175, scale: 1.18, speed: 0.04 },
      { x: 4625, y: 265, scale: 1.12, speed: 0.03 },
      { x: 5320, y: 190, scale: 0.88, speed: 0.025 },
    ].forEach((cloudConfig) => {
      const cloud = drawCloud(this, cloudConfig.x, cloudConfig.y, cloudConfig.scale);
      cloud.speed = cloudConfig.speed;
      cloud.setScrollFactor(0.55);
      this.clouds.push(cloud);
    });

    const horizon = this.add.graphics();
    horizon.fillStyle(0x2d78ef, 1);
    horizon.fillRect(0, 610, COURSE_WIDTH, 290);
    horizon.fillStyle(0x48b5ff, 0.92);
    horizon.fillRect(0, 585, COURSE_WIDTH, 40);

    const islands = this.add.graphics();
    islands.fillStyle(0xb6eeff, 0.46);
    [100, 1260, 2380, 3530, 4860].forEach((x, index) => {
      islands.fillRoundedRect(x, 515 - (index % 2) * 34, 160 + (index % 3) * 36, 180 + (index % 2) * 34, 80);
    });
    islands.fillStyle(0xc6ffb4, 0.45);
    [60, 1490, 3110, 4310].forEach((x) => {
      islands.fillRoundedRect(x, 540, 120, 160, 56);
    });
    islands.fillStyle(0x81d875, 0.75);
    [1220, 2760, 4070, 5180].forEach((x) => {
      islands.fillRoundedRect(x, 560, 140, 110, 54);
    });

    const lighthouseIsland = this.add.graphics();
    lighthouseIsland.fillStyle(0x6fc86e, 1);
    lighthouseIsland.fillEllipse(790, 655, 200, 80);
    lighthouseIsland.fillStyle(0x2a7834, 1);
    lighthouseIsland.fillEllipse(790, 675, 220, 65);
    lighthouseIsland.fillStyle(0xffffff, 1);
    lighthouseIsland.fillRect(770, 555, 26, 90);
    lighthouseIsland.fillStyle(0xe44343, 1);
    lighthouseIsland.fillRect(770, 555, 26, 18);
    lighthouseIsland.fillRect(770, 590, 26, 18);
    lighthouseIsland.fillRect(770, 625, 26, 20);
    lighthouseIsland.fillStyle(0xd72a2a, 1);
    lighthouseIsland.fillTriangle(765, 555, 801, 555, 783, 530);

    this.drawGround();
  }

  drawGround() {
    const ground = this.add.graphics();
    drawTerrainChunk(ground, 0, FLOOR_Y - 36, 360, 180);
    drawTerrainChunk(ground, FINAL_GROUND_X, FLOOR_Y - 36, FINAL_GROUND_WIDTH, 180);
    drawTerrainChunk(ground, 2720, FLOOR_Y + 18, 220, 118);

    const island = this.add.graphics();
    island.fillStyle(0x8ed84f, 1);
    island.fillRoundedRect(4540, 585, 170, 28, 10);
    island.fillStyle(0x3ca932, 1);
    island.fillRect(4540, 595, 170, 18);
    island.fillStyle(0x7a4b22, 1);
    for (let index = 0; index < 7; index += 1) {
      island.fillRoundedRect(4548 + index * 23, 610, 18, 52 + (index % 2) * 10, 8);
    }

    const signs = this.add.graphics();
    signs.fillStyle(0x8f5d2f, 1);
    signs.fillRect(44, 615, 18, 72);
    signs.fillStyle(0xb87032, 1);
    signs.fillRoundedRect(18, 595, 96, 56, 6);
    signs.fillStyle(0xb23535, 1);
    signs.fillRoundedRect(4205, 725, 118, 78, 6);
    signs.fillStyle(0xaa732f, 1);
    signs.fillRect(4260, 680, 10, 44);

    const signText = this.add.text(66, 624, "GO!", {
      fontFamily: "Arial Black",
      fontSize: "28px",
      color: "#fffdf3",
    });
    signText.setOrigin(0.5);
    const warnText = this.add.text(4264, 765, "ENTER\nHERE!", {
      fontFamily: "Arial Black",
      fontSize: "22px",
      align: "center",
      color: "#fffdf3",
    });
    warnText.setOrigin(0.5);

    const questionBlocks = this.add.graphics();
    [5295, 5348].forEach((x) => {
      questionBlocks.fillStyle(0xf6c73e, 1);
      questionBlocks.fillRoundedRect(x, 770, 44, 44, 8);
      questionBlocks.lineStyle(4, 0xc58f18, 1);
      questionBlocks.strokeRoundedRect(x, 770, 44, 44, 8);
      this.add.text(x + 22, 792, "!", {
        fontFamily: "Arial Black",
        fontSize: "26px",
        color: "#9d5f12",
      }).setOrigin(0.5);
    });

    this.add.image(95, 655, "flower").setScale(1.25);
  }

  createPlatforms() {
    this.platforms = this.physics.add.staticGroup();
    this.movingPlatforms = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.containerPlatforms = [];

    addPlatformBody(this, this.platforms, 180, FLOOR_Y + 54, 360, 180);
    addPlatformBody(this, this.platforms, 2830, FLOOR_Y + 78, 220, 118);
    addPlatformBody(
      this,
      this.platforms,
      FINAL_GROUND_X + FINAL_GROUND_WIDTH / 2,
      FLOOR_Y + 54,
      FINAL_GROUND_WIDTH,
      180,
    );
    addPlatformBody(this, this.platforms, 4625, 623, 180, 72);

    [
      { x: 450, y: 496, width: 320, range: 22, speed: 0.0013, phase: 0.4 },
      { x: 900, y: 395, width: 355, range: 32, speed: 0.0011, phase: 2.1 },
      { x: 1380, y: 510, width: 335, range: 26, speed: 0.0015, phase: 4.4 },
      { x: 1880, y: 330, width: 390, range: 24, speed: 0.00095, phase: 1.8 },
      { x: 2440, y: 500, width: 340, range: 34, speed: 0.00125, phase: 3.2 },
      { x: 3040, y: 360, width: 380, range: 28, speed: 0.001, phase: 5.1 },
      { x: 3600, y: 525, width: 350, range: 24, speed: 0.00145, phase: 2.8 },
      { x: 4140, y: 365, width: 395, range: 30, speed: 0.0009, phase: 0.9 },
    ].forEach((container) => {
      this.containerPlatforms.push(
        createMovingContainerPlatform(this, this.movingPlatforms, {
          ...container,
          height: getContainerHeight(container.width),
        }),
      );
    });
  }

  createCollectibles() {
    this.coinsRemaining = 0;
    this.levelCompleted = false;

    this.coins = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.stars = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.collectibleSprites = [];
    [
      [560, 395],
      [1030, 300],
      [1510, 420],
      [2090, 235],
      [2590, 408],
      [3220, 265],
      [3770, 430],
      [4335, 280],
    ].forEach(([x, y]) => {
      const coin = this.coins.create(x, y, "coin");
      coin.body.setSize(20, 28).setOffset(8, 4);
      coin.body.allowGravity = false;
      coin.body.immovable = true;
      coin.body.moves = false;
      coin.baseY = y;
      coin.bobOffset = x * 0.0125;
      coin.lastDrawY = y;
      this.collectibleSprites.push(coin);
      this.coinsRemaining += 1;
    });

    [
      [1110, 245],
      [1995, 210],
      [3140, 235],
      [4255, 255],
      [4980, 470],
    ].forEach(([x, y], index) => {
      const star = this.stars.create(x, y, "star");
      star.body.setCircle(24, 6, 6);
      star.body.allowGravity = false;
      star.body.immovable = true;
      star.body.moves = false;
      star.baseY = y;
      star.bobOffset = index * 1.7;
      star.pointValue = 350 + index * 75;
      star.lastDrawY = y;
      this.collectibleSprites.push(star);
    });
  }

  createHazards() {
    this.hazards = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.birds = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.birdSprites = [];

    const cactus = this.hazards.create(2855, 730, "cactus");
    cactus.body.setSize(52, 64).setOffset(6, 6);

    this.snail = this.physics.add.sprite(4620, 545, "snail");
    this.snail.setCollideWorldBounds(true);
    this.snail.setBounce(1, 0);
    this.snail.setVelocityX(55);
    this.snail.body.setSize(44, 28).setOffset(2, 20);

    this.blueEnemy = this.physics.add.sprite(168, 804, "blue-enemy");
    this.blueEnemy.setCollideWorldBounds(true);
    this.blueEnemy.setBounce(1, 0);
    this.blueEnemy.setVelocityX(-62);
    this.blueEnemy.body.setSize(44, 44).setOffset(2, 4);

    [
      { x: 1220, y: 258, range: 280, speed: 0.0012, phase: 0.4 },
      { x: 2690, y: 250, range: 340, speed: 0.001, phase: 2.2 },
      { x: 3860, y: 225, range: 300, speed: 0.00135, phase: 4.1 },
    ].forEach((config) => {
      const bird = this.birds.create(config.x, config.y, "bird-a");
      bird.body.setSize(42, 22).setOffset(3, 9);
      bird.body.allowGravity = false;
      bird.body.immovable = true;
      bird.body.moves = false;
      bird.baseX = config.x;
      bird.baseY = config.y;
      bird.range = config.range;
      bird.speed = config.speed;
      bird.phase = config.phase;
      bird.lastX = config.x;
      bird.setDepth(18);
      this.birdSprites.push(bird);
    });
  }

  createGoal() {
    const width = 760;
    const height = Math.round(width * (831 / 910));
    const x = FINAL_GROUND_X + 80;
    const y = FLOOR_Y - 36 - height + 18;

    this.goalContainer = this.add.image(x + width / 2, y + height / 2, PLUS_LINE_GOAL_TEXTURE_KEY);
    this.goalContainer.setDisplaySize(width, height);
    this.goalContainer.setDepth(7);
    this.goalDoorOpen = false;

    this.goalZone = this.add.zone(
      x + width * 0.31,
      y + height * 0.72,
      width * 0.2,
      height * 0.34,
    );
    this.physics.add.existing(this.goalZone, true);
  }

  createPlayer() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      leftA: Phaser.Input.Keyboard.KeyCodes.A,
      rightD: Phaser.Input.Keyboard.KeyCodes.D,
      jumpW: Phaser.Input.Keyboard.KeyCodes.W,
    });

    this.player = this.physics.add.sprite(PLAYER_SPAWN_X, PLAYER_SPAWN_Y, "hero-idle");
    this.player.setCollideWorldBounds(false);
    this.player.setBounce(0);
    this.player.setDragX(1500);
    this.player.setMaxVelocity(360, 1280);
    this.player.body.setSize(28, 46).setOffset(8, 2);
    this.player.setDepth(20);

    this.spawnPoint = new Phaser.Math.Vector2(PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
    this.lastSafePosition = this.spawnPoint.clone();
    this.coyoteTime = 0;
    this.jumpBuffer = 0;
    this.jumpHoldTime = 0;
    this.hearts = runState.lives;
    this.lives = runState.lives;
    this.invulnerableUntil = 0;
    this.isRespawning = false;

    this.physics.world.setBounds(0, 0, COURSE_WIDTH, GAME_HEIGHT + 360);
    this.cameras.main.setBounds(0, 0, COURSE_WIDTH, GAME_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(460, 260);
    this.cameras.main.roundPixels = true;
  }

  createEffects() {
    const dustConfig = {
      speed: { min: 50, max: 180 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.75, end: 0 },
      lifespan: 340,
      quantity: 8,
      frequency: -1,
    };

    this.dust = this.add.particles(0, 0, "spark", dustConfig);
    this.coinBurst = this.add.particles(0, 0, "spark", {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.95, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffd957, 0xff8f31, 0xffffff],
      lifespan: 420,
      quantity: 10,
      frequency: -1,
    });
  }

  createCollisions() {
    this.physics.add.collider(this.player, this.platforms, () => this.rememberSafePosition());
    this.physics.add.collider(this.player, this.movingPlatforms, () => this.rememberSafePosition());
    this.physics.add.collider(this.snail, this.platforms);
    this.physics.add.collider(this.snail, this.movingPlatforms);
    this.physics.add.collider(this.blueEnemy, this.platforms);
    this.physics.add.collider(this.blueEnemy, this.movingPlatforms);

    this.physics.add.overlap(this.player, this.coins, (_player, coin) => {
      coin.disableBody(true, true);
      this.addScore(50);
      this.coinsRemaining -= 1;
      this.coinBurst.emitParticleAt(coin.x, coin.y, 10);
      this.syncHud();
    });

    this.physics.add.overlap(this.player, this.stars, (_player, star) => {
      const value = star.pointValue ?? 350;
      star.disableBody(true, true);
      this.addScore(value);
      this.coinBurst.emitParticleAt(star.x, star.y, 22);
      this.showFloatingScore(star.x, star.y, `+${value}`);
      this.syncHud();
    });

    this.physics.add.overlap(this.player, this.goalZone, () => this.completeLevel());

    this.physics.add.collider(this.player, this.snail, this.handleEnemyCollision, undefined, this);
    this.physics.add.collider(this.player, this.blueEnemy, this.handleEnemyCollision, undefined, this);
    this.physics.add.overlap(this.player, this.birds, () => this.loseLife("BIRD STRIKE", "A flying hazard clipped the hero."));
    this.physics.add.overlap(this.player, this.hazards, () => this.damagePlayer());
  }

  createTimer() {
    this.timeLeft = LEVEL_TIME_LIMIT;
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.isFrozen || this.isRespawning) {
          return;
        }
        this.timeLeft -= 1;
        this.syncHud();
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.syncHud();
          this.loseLife("TIME UP", "The countdown reached zero before the Plus Line container.", {
            ignoreInvulnerability: true,
          });
        }
      },
    });
  }

  resetState() {
    this.isFrozen = false;
    this.score = runState.score;
    this.highScore = runState.highScore;
    this.level = runState.level;
    this.lives = runState.lives;
    this.hearts = runState.lives;
    this.syncHud();
  }

  syncHud() {
    syncHud({
      score: this.score,
      highScore: this.highScore,
      level: this.level,
      timeLeft: this.timeLeft,
      lives: this.lives,
      hearts: this.hearts,
    });
  }

  addScore(points) {
    this.score += points;
    runState.score = this.score;
    if (this.score > runState.highScore) {
      runState.highScore = this.score;
      saveHighScore(this.score);
    }
    this.highScore = runState.highScore;
  }

  rememberSafePosition() {
    if (
      this.isRespawning
      || this.player.body.velocity.y < -40
      || !(this.player.body.blocked.down || this.player.body.touching.down)
    ) {
      return;
    }

    this.lastSafePosition.set(this.player.x, this.player.y);
  }

  showFloatingScore(x, y, text) {
    const label = this.add.text(x, y, text, {
      fontFamily: "Arial Black",
      fontSize: "28px",
      color: "#fff3a3",
      stroke: "#6d3d00",
      strokeThickness: 4,
    });
    label.setOrigin(0.5);
    label.setDepth(40);
    this.tweens.add({
      targets: label,
      y: y - 42,
      alpha: 0,
      duration: 680,
      ease: "Quad.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  startNextLevel() {
    runState.score = this.score;
    runState.lives = this.lives;
    runState.level = this.level + 1;
    this.scene.restart();
  }

  restartRun() {
    resetRunState();
    this.scene.restart();
  }

  completeLevel() {
    if (this.levelCompleted || this.isFrozen || this.isRespawning) {
      return;
    }

    this.levelCompleted = true;
    this.isFrozen = true;
    this.addScore(1000 + Math.max(0, this.timeLeft) * 5);
    this.syncHud();
    this.player.body.allowGravity = false;
    this.player.setVelocity(0, 0);
    this.player.setAcceleration(0);
    this.timerEvent.paused = true;
    this.snail.setVelocityX(0);
    this.blueEnemy.setVelocityX(0);
    this.containerPlatforms.forEach(({ collider }) => collider.body.setVelocity(0, 0));

    this.openGoalDoor();
    this.tweens.add({
      targets: this.player,
      x: this.goalZone.x,
      y: this.goalZone.y + 34,
      alpha: 0,
      scale: 0.28,
      duration: 720,
      ease: "Sine.easeIn",
      delay: 220,
      onComplete: () => {
        showOverlay(
          `LEVEL ${this.level}`,
          "LEVEL CLEAR",
          "You reached the open container. Continue to the next level with your score intact.",
          "→",
        );
      },
    });
  }

  openGoalDoor() {
    if (this.goalDoorOpen) {
      return;
    }

    this.goalDoorOpen = true;
    this.tweens.add({
      targets: this.goalContainer,
      alpha: 0.9,
      scaleX: this.goalContainer.scaleX * 1.015,
      scaleY: this.goalContainer.scaleY * 1.015,
      duration: 260,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  handleEnemyCollision(player, enemy) {
    if (this.isFrozen || this.isRespawning || this.time.now < this.invulnerableUntil) {
      return;
    }

    const stomped = player.body.velocity.y > 180 && player.y + 18 < enemy.y;
    if (stomped) {
      enemy.disableBody(true, true);
      player.setVelocityY(-480);
      this.addScore(125);
      this.coinBurst.emitParticleAt(enemy.x, enemy.y, 12);
      this.syncHud();
      return;
    }

    this.damagePlayer();
  }

  damagePlayer() {
    this.loseLife("OUCH", "The route hazard cost one life.");
  }

  respawn() {
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.setVelocity(0, 0);
    this.player.setAcceleration(0);
    this.player.setAlpha(1);
    this.player.setScale(1);
    this.player.setAngle(0);
    this.player.setTint(0xffffff);
    this.player.body.allowGravity = true;
    this.player.clearTint();
    this.cameras.main.stopFollow();
    this.cameras.main.scrollX = 0;
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.lastSafePosition = this.spawnPoint.clone();
    this.timeLeft = LEVEL_TIME_LIMIT;
    this.timerEvent.paused = false;
    this.goalDoorOpen = false;
    this.goalContainer.setAlpha(1);
    this.invulnerableUntil = this.time.now + 1000;
    this.isRespawning = false;
    this.syncHud();
  }

  handleFall() {
    this.loseLife("MISS", "You fell out of the container route.", {
      ignoreInvulnerability: true,
    });
  }

  loseLife(title, copy, { ignoreInvulnerability = false } = {}) {
    if (
      this.isFrozen
      || this.isRespawning
      || (!ignoreInvulnerability && this.time.now < this.invulnerableUntil)
    ) {
      return;
    }

    this.isRespawning = true;
    this.lives -= 1;
    this.hearts = Math.max(0, this.lives);
    runState.lives = this.lives;
    this.syncHud();
    this.cameras.main.shake(180, 0.006);
    this.player.body.allowGravity = false;
    this.player.setVelocity(0, 0);
    this.player.setAcceleration(0);
    this.player.setTint(0xff8a8a);
    this.coinBurst.emitParticleAt(this.player.x, Math.min(this.player.y, GAME_HEIGHT - 24), 14);

    this.tweens.add({
      targets: this.player,
      alpha: 0,
      angle: this.player.flipX ? -360 : 360,
      scale: 0.35,
      duration: 420,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (this.lives <= 0) {
          runState.lives = 0;
          this.syncHud();
          this.freezeRun(
            "GAME OVER",
            `${copy} Final score: ${this.score}. High score: ${this.highScore}. Tap restart for another run.`,
          );
          return;
        }

        this.respawn();
        this.showFloatingScore(this.player.x + 60, this.player.y - 40, title);
      },
    });
  }

  freezeRun(title, copy) {
    if (this.isFrozen) {
      return;
    }
    this.isFrozen = true;
    this.player.setVelocity(0, 0);
    this.player.body.allowGravity = false;
    this.timerEvent.paused = true;
    this.snail.setVelocityX(0);
    this.blueEnemy.setVelocityX(0);
    this.containerPlatforms.forEach(({ collider }) => collider.body.setVelocity(0, 0));
    showOverlay("CONTAINEX JUMP", title, copy);
  }

  update(time, delta) {
    if (this.isFrozen) {
      return;
    }

    this.updateClouds(delta);
    this.updateMovingPlatforms(time, delta);
    this.updateCollectibles(time);
    this.updateBirds(time);
    this.updateEnemies();
    if (!this.isRespawning) {
      this.updatePlayer(delta);
    }

    if (this.player.y > FALL_LIMIT_Y && this.player.body.velocity.y > 120) {
      this.handleFall();
    }
  }

  updateClouds(delta) {
    this.clouds.forEach((cloud) => {
      cloud.x += cloud.speed * delta;
      if (cloud.x > COURSE_WIDTH + 140) {
        cloud.x = -180;
      }
    });
  }

  updateMovingPlatforms(time, delta) {
    const velocityScale = delta > 0 ? 1000 / delta : 0;

    this.containerPlatforms.forEach((platform) => {
      const nextY = platform.baseY + Math.sin(time * platform.speed + platform.phase) * platform.range;
      const deltaY = nextY - platform.sprite.y;

      platform.sprite.setY(nextY);
      platform.collider.setY(nextY);
      platform.collider.body.setVelocity(0, deltaY * velocityScale);
      platform.collider.body.updateFromGameObject();
    });
  }

  updateEnemies() {
    if (this.snail.active) {
      if (this.snail.x < 4560) {
        this.snail.setVelocityX(55);
        this.snail.setFlipX(false);
      } else if (this.snail.x > 4700) {
        this.snail.setVelocityX(-55);
        this.snail.setFlipX(true);
      }
    }

    if (this.blueEnemy.active) {
      if (this.blueEnemy.x < 36) {
        this.blueEnemy.setVelocityX(62);
        this.blueEnemy.setFlipX(true);
      } else if (this.blueEnemy.x > 174) {
        this.blueEnemy.setVelocityX(-62);
        this.blueEnemy.setFlipX(false);
      }
    }
  }

  updateBirds(time) {
    this.birdSprites.forEach((bird) => {
      if (!bird.active) {
        return;
      }

      const nextX = Math.round(bird.baseX + Math.sin(time * bird.speed + bird.phase) * bird.range);
      const nextY = Math.round(bird.baseY + Math.sin(time * bird.speed * 1.7 + bird.phase) * 34);
      bird.setPosition(nextX, nextY);
      bird.setFlipX(nextX > bird.lastX);
      bird.setTexture(Math.floor(time / 140) % 2 === 0 ? "bird-a" : "bird-b");
      bird.body.updateFromGameObject();
      bird.lastX = nextX;
    });
  }

  updateCollectibles(time) {
    this.collectibleSprites.forEach((collectible) => {
      if (!collectible.active) {
        return;
      }

      const nextY = Math.round(collectible.baseY + Math.sin(time * 0.004 + collectible.bobOffset) * 6);
      if (nextY !== collectible.lastDrawY) {
        collectible.setY(nextY);
        collectible.body.updateFromGameObject();
        collectible.lastDrawY = nextY;
      }
      if (collectible.texture.key === "star") {
        collectible.setAngle(Math.round((time * 0.045 + collectible.bobOffset * 20) % 360));
      }
    });
  }

  updatePlayer(delta) {
    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    const leftDown =
      this.cursors.left.isDown || this.keys.leftA.isDown || touchState.left;
    const rightDown =
      this.cursors.right.isDown || this.keys.rightD.isDown || touchState.right;
    const jumpDown =
      this.cursors.space.isDown ||
      this.cursors.up.isDown ||
      this.keys.jumpW.isDown ||
      touchState.jump;
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.jumpW) ||
      touchState.jumpQueued;

    touchState.jumpQueued = false;

    if (jumpPressed) {
      this.jumpBuffer = 130;
    } else {
      this.jumpBuffer = Math.max(0, this.jumpBuffer - delta);
    }

    if (onGround) {
      this.coyoteTime = 110;
      this.rememberSafePosition();
    } else {
      this.coyoteTime = Math.max(0, this.coyoteTime - delta);
    }

    const moveDirection = Number(rightDown) - Number(leftDown);
    const targetVelocity = moveDirection * PLAYER_RUN_SPEED;
    const currentVelocity = this.player.body.velocity.x;

    if (moveDirection !== 0) {
      this.player.setAccelerationX(moveDirection * 1800);
      if (Math.abs(currentVelocity) < Math.abs(targetVelocity)) {
        this.player.setVelocityX(
          Phaser.Math.Clamp(
            currentVelocity + moveDirection * 28,
            -PLAYER_RUN_SPEED,
            PLAYER_RUN_SPEED,
          ),
        );
      }
      this.player.setFlipX(moveDirection < 0);
    } else {
      this.player.setAccelerationX(0);
    }

    const cameraLeftLimit = this.cameras.main.scrollX + 44;
    if (this.player.x < cameraLeftLimit) {
      this.player.setX(cameraLeftLimit);
      this.player.setVelocityX(Math.max(0, this.player.body.velocity.x));
    }

    if (this.jumpBuffer > 0 && this.coyoteTime > 0) {
      this.player.setVelocityY(PLAYER_JUMP_SPEED);
      this.jumpBuffer = 0;
      this.coyoteTime = 0;
      this.jumpHoldTime = PLAYER_JUMP_HOLD_MS;
      this.dust.emitParticleAt(this.player.x, this.player.y + 26, 6);
    }

    if (jumpDown && this.jumpHoldTime > 0 && this.player.body.velocity.y < 0) {
      this.player.setVelocityY(
        Phaser.Math.Clamp(
          this.player.body.velocity.y - PLAYER_JUMP_HOLD_FORCE,
          PLAYER_JUMP_SPEED - 40,
          0,
        ),
      );
      this.jumpHoldTime = Math.max(0, this.jumpHoldTime - delta);
    } else {
      this.jumpHoldTime = 0;
    }

    if (!jumpDown && this.player.body.velocity.y < PLAYER_SHORT_HOP_SPEED) {
      this.player.setVelocityY(PLAYER_SHORT_HOP_SPEED);
    }

    if (onGround && Math.abs(this.player.body.velocity.x) > 12) {
      if (!this.wasGrounded) {
        this.dust.emitParticleAt(this.player.x, this.player.y + 24, 8);
      }
    }
    this.wasGrounded = onGround;

    const absVelocityX = Math.abs(this.player.body.velocity.x);
    if (!onGround) {
      this.player.setTexture("hero-jump");
    } else if (absVelocityX > 70) {
      const frame = Math.floor(this.time.now / 120) % 2 === 0 ? "hero-run-a" : "hero-run-b";
      this.player.setTexture(frame);
    } else {
      this.player.setTexture("hero-idle");
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#53b8ff",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 1720 },
      debug: false,
    },
  },
  scene: [ContainexJumpScene],
};

new Phaser.Game(config);

function addPlatformBody(scene, group, x, y, width, height) {
  const body = scene.add.rectangle(x, y, width, height, 0xffffff, 0);
  scene.physics.add.existing(body, true);
  group.add(body);
  return body;
}

function createMovingContainerPlatform(scene, group, { x, y, width, height, range, speed, phase }) {
  const sprite = drawContainexContainer(scene, { x, y, width, height });
  const collider = scene.add.rectangle(
    x + width / 2,
    y + height / 2,
    width - 20,
    height - 14,
    0xffffff,
    0,
  );

  scene.physics.add.existing(collider);
  collider.setVisible(false);
  collider.body.setAllowGravity(false);
  collider.body.setImmovable(true);
  collider.body.updateFromGameObject();
  group.add(collider);

  return {
    sprite,
    collider,
    baseY: sprite.y,
    range,
    speed,
    phase,
  };
}

function getContainerHeight(width) {
  return Math.round(width * CONTAINER_ASPECT);
}

function drawCloud(scene, x, y, scale) {
  const cloud = scene.add.container(x, y);
  const cloudColor = 0xffffff;
  const alpha = 0.9;
  [
    [-65, 18, 72],
    [-20, -8, 86],
    [42, 10, 68],
    [90, 20, 42],
  ].forEach(([offsetX, offsetY, size]) => {
    const puff = scene.add.ellipse(offsetX, offsetY, size, size * 0.72, cloudColor, alpha);
    cloud.add(puff);
  });
  cloud.setScale(scale);
  return cloud;
}

function drawTerrainChunk(graphics, x, y, width, height) {
  graphics.fillStyle(0x8ae03f, 1);
  graphics.fillRect(x, y, width, 30);
  graphics.fillStyle(0x31a72a, 1);
  graphics.fillRect(x, y + 14, width, 24);
  graphics.fillStyle(0x7a4b22, 1);
  graphics.fillRect(x, y + 32, width, height);
  graphics.fillStyle(0x956338, 1);
  for (let row = 0; row < height / 38; row += 1) {
    for (let column = 0; column < width / 42; column += 1) {
      graphics.fillRoundedRect(x + column * 42 + 4, y + 42 + row * 38, 34, 30, 8);
    }
  }
}

function drawContainexContainer(scene, { x, y, width, height }) {
  const sprite = scene.add.image(x + width / 2, y + height / 2, CONTAINER_TEXTURE_KEY);
  sprite.setDisplaySize(width, height);
  sprite.setDepth(6);
  return sprite;
}

function createTextures(scene) {
  if (scene.textures.exists("hero-idle")) {
    return;
  }

  createPixelTexture(scene, "hero-idle", 44, 48, (ctx) => drawHeroFrame(ctx, "idle"));
  createPixelTexture(scene, "hero-run-a", 44, 48, (ctx) => drawHeroFrame(ctx, "runA"));
  createPixelTexture(scene, "hero-run-b", 44, 48, (ctx) => drawHeroFrame(ctx, "runB"));
  createPixelTexture(scene, "hero-jump", 44, 48, (ctx) => drawHeroFrame(ctx, "jump"));
  createPixelTexture(scene, "coin", 36, 36, drawCoin);
  createPixelTexture(scene, "star", 60, 60, drawStar);
  createPixelTexture(scene, "snail", 48, 48, drawSnail);
  createPixelTexture(scene, "cactus", 64, 72, drawCactus);
  createPixelTexture(scene, "blue-enemy", 48, 48, drawBlueEnemy);
  createPixelTexture(scene, "bird-a", 48, 36, (ctx) => drawBird(ctx, "up"));
  createPixelTexture(scene, "bird-b", 48, 36, (ctx) => drawBird(ctx, "down"));
  createPixelTexture(scene, "spark", 14, 14, drawSpark);
  createPixelTexture(scene, "flower", 40, 40, drawFlower);
}

function createPixelTexture(scene, key, width, height, draw) {
  const texture = scene.textures.createCanvas(key, width, height);
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx, width, height);
  texture.refresh();
}

function drawHeroFrame(ctx, pose) {
  const blue = "#1854db";
  const navy = "#0d2e85";
  const yellow = "#ffc53d";
  const skin = "#ffd9b1";
  const hair = "#6b341a";
  const brown = "#734115";
  const white = "#f4f7ff";

  clear(ctx, 44, 48);

  const legA = pose === "runA" ? 27 : pose === "runB" ? 19 : 23;
  const legB = pose === "runA" ? 18 : pose === "runB" ? 28 : 23;
  const armY = pose === "jump" ? 10 : 16;
  const armOffset = pose === "runB" ? -2 : 0;

  fillRect(ctx, 12, 4, 18, 8, blue);
  fillRect(ctx, 10, 8, 22, 5, navy);
  fillRect(ctx, 24, 10, 8, 4, yellow);
  fillRect(ctx, 13, 12, 16, 13, skin);
  fillRect(ctx, 9, 14, 6, 6, hair);
  fillRect(ctx, 27, 14, 5, 6, hair);
  fillRect(ctx, 12, 24, 18, 9, yellow);
  fillRect(ctx, 15, 28, 16, 15, blue);
  fillRect(ctx, 18, 29, 4, 12, white);
  fillRect(ctx, 24, 29, 4, 12, white);
  fillRect(ctx, 14 + armOffset, armY, 6, 13, blue);
  fillRect(ctx, 28 + armOffset, armY + 2, 6, 12, blue);
  fillRect(ctx, 12 + armOffset, armY + 11, 5, 5, white);
  fillRect(ctx, 32 + armOffset, armY + 11, 5, 5, white);
  fillRect(ctx, 15, 42, 6, 4, brown);
  fillRect(ctx, 24, 42, 6, 4, brown);

  if (pose === "jump") {
    fillRect(ctx, 10, 34, 8, 6, blue);
    fillRect(ctx, 28, 34, 8, 6, blue);
    fillRect(ctx, 8, 40, 8, 4, brown);
    fillRect(ctx, 28, 39, 8, 4, brown);
  } else {
    fillRect(ctx, 14, 34, 5, 9, blue);
    fillRect(ctx, 24, 34, 5, 9, blue);
    fillRect(ctx, legA, 38, 7, 4, blue);
    fillRect(ctx, legB, 38, 7, 4, blue);
    fillRect(ctx, legA, 42, 8, 4, brown);
    fillRect(ctx, legB, 42, 8, 4, brown);
  }
}

function drawCoin(ctx, width, height) {
  clear(ctx, width, height);
  ctx.fillStyle = "#fcd24b";
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, 11, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6b0";
  ctx.beginPath();
  ctx.ellipse(width / 2 - 3, height / 2 - 1, 5, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#df9d18";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, 11, 15, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawStar(ctx, width, height) {
  clear(ctx, width, height);
  ctx.fillStyle = "#ffe25d";
  ctx.strokeStyle = "#ffb129";
  ctx.lineWidth = 4;
  starPath(ctx, width / 2, height / 2, 5, 22, 11);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#7a5900";
  ctx.fillRect(22, 24, 5, 5);
  ctx.fillRect(34, 24, 5, 5);
}

function drawSnail(ctx, width, height) {
  clear(ctx, width, height);
  ctx.fillStyle = "#f2a356";
  ctx.fillRect(10, 26, 26, 10);
  ctx.fillRect(30, 22, 9, 14);
  ctx.fillRect(14, 34, 5, 6);
  ctx.fillRect(26, 34, 5, 6);
  ctx.fillStyle = "#9150db";
  ctx.beginPath();
  ctx.arc(20, 22, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#bf89ff";
  ctx.beginPath();
  ctx.arc(20, 22, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f9f7ff";
  ctx.fillRect(32, 12, 3, 10);
  ctx.fillRect(38, 10, 3, 12);
  ctx.fillRect(31, 10, 6, 4);
  ctx.fillRect(37, 8, 6, 4);
  ctx.fillStyle = "#302536";
  ctx.fillRect(33, 12, 2, 2);
  ctx.fillRect(39, 10, 2, 2);
}

function drawCactus(ctx, width, height) {
  clear(ctx, width, height);
  ctx.fillStyle = "#7d7f8f";
  ctx.fillRect(12, 56, 40, 10);
  ctx.fillStyle = "#1fbe3d";
  ctx.beginPath();
  ctx.arc(32, 32, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(22, 18, 8, 30);
  ctx.fillRect(34, 18, 8, 30);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(22, 26, 5, 5);
  ctx.fillRect(36, 26, 5, 5);
  ctx.fillStyle = "#111111";
  ctx.fillRect(24, 28, 2, 2);
  ctx.fillRect(38, 28, 2, 2);
  ctx.fillStyle = "#f8fbff";
  [
    [18, 12],
    [10, 24],
    [13, 42],
    [27, 12],
    [48, 20],
    [50, 39],
    [36, 8],
  ].forEach(([x, y]) => {
    triangle(ctx, x, y, x + 6, y + 2, x + 1, y + 10, "#f8fbff");
  });
}

function drawBlueEnemy(ctx, width, height) {
  clear(ctx, width, height);
  ctx.fillStyle = "#1d7df2";
  ctx.fillRect(4, 8, 40, 34);
  ctx.fillStyle = "#65c5ff";
  ctx.fillRect(9, 13, 30, 8);
  ctx.fillStyle = "#f5f7ff";
  ctx.fillRect(10, 22, 10, 8);
  ctx.fillRect(28, 22, 10, 8);
  ctx.fillStyle = "#111111";
  ctx.fillRect(14, 24, 3, 3);
  ctx.fillRect(31, 24, 3, 3);
  ctx.fillStyle = "#ff4852";
  ctx.fillRect(14, 32, 20, 6);
  triangle(ctx, 6, 8, 14, 4, 18, 12, "#9fe3ff");
  triangle(ctx, 38, 8, 30, 4, 26, 12, "#9fe3ff");
}

function drawBird(ctx, pose) {
  clear(ctx, 48, 36);
  const wingTipY = pose === "up" ? 5 : 25;

  ctx.fillStyle = "#101820";
  ctx.fillRect(16, 15, 18, 9);
  ctx.fillRect(30, 13, 8, 7);
  triangle(ctx, 38, 15, 46, 18, 38, 21, "#f4bf3f");
  ctx.fillStyle = "#f6f8ff";
  ctx.fillRect(31, 15, 3, 3);
  ctx.fillStyle = "#05070b";
  ctx.fillRect(32, 16, 2, 2);

  triangle(ctx, 18, 16, 4, wingTipY, 24, 18, "#2f4252");
  triangle(ctx, 23, 17, 36, wingTipY, 29, 19, "#41596b");
  triangle(ctx, 17, 22, 7, 29, 26, 23, "#0c1118");
  ctx.fillStyle = "#263746";
  ctx.fillRect(14, 23, 6, 4);
}

function drawSpark(ctx, width, height) {
  clear(ctx, width, height);
  ctx.fillStyle = "#fff6b5";
  ctx.fillRect(6, 0, 2, 14);
  ctx.fillRect(0, 6, 14, 2);
  ctx.fillStyle = "#ffd44f";
  ctx.fillRect(3, 3, 8, 8);
}

function drawFlower(ctx, width, height) {
  clear(ctx, width, height);
  ctx.fillStyle = "#2fa83c";
  ctx.fillRect(19, 14, 3, 20);
  ctx.fillRect(12, 20, 8, 3);
  ctx.fillRect(22, 18, 8, 3);
  ctx.fillStyle = "#ff7fa6";
  ctx.beginPath();
  ctx.arc(20, 14, 5, 0, Math.PI * 2);
  ctx.arc(14, 18, 5, 0, Math.PI * 2);
  ctx.arc(26, 18, 5, 0, Math.PI * 2);
  ctx.arc(17, 24, 5, 0, Math.PI * 2);
  ctx.arc(23, 24, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe37e";
  ctx.beginPath();
  ctx.arc(20, 19, 5, 0, Math.PI * 2);
  ctx.fill();
}

function triangle(ctx, x1, y1, x2, y2, x3, y3, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

function starPath(ctx, cx, cy, spikes, outerRadius, innerRadius) {
  let rotation = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let index = 0; index < spikes; index += 1) {
    ctx.lineTo(cx + Math.cos(rotation) * outerRadius, cy + Math.sin(rotation) * outerRadius);
    rotation += step;
    ctx.lineTo(cx + Math.cos(rotation) * innerRadius, cy + Math.sin(rotation) * innerRadius);
    rotation += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

function fillRect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}
