import * as THREE from 'three';
import { soundManager } from './audio';
import {
  LANE_X_POSITIONS,
  Lane,
  ObstacleData,
  ObstacleType,
  CoinData,
  PowerupData,
  PowerupType,
  Particle,
  GameStats,
} from './types';

export interface GameCallbacks {
  onStatsUpdate: (stats: GameStats) => void;
  onGameOver: (stats: GameStats) => void;
  onCoinCollected: (coins: number) => void;
  onPowerupAcquired: (type: PowerupType) => void;
}

export class SubwayGame {
  private container: HTMLElement;
  private callbacks: GameCallbacks;

  // Three.js Core
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private clock!: THREE.Clock;
  private animationFrameId: number | null = null;

  // Game States
  public isRunning: boolean = false;
  public isPaused: boolean = false;
  public isGameOver: boolean = false;

  // Player State
  private playerGroup!: THREE.Group;
  private playerHead!: THREE.Mesh;
  private playerTorso!: THREE.Mesh;
  private playerLeftArm!: THREE.Group;
  private playerRightArm!: THREE.Group;
  private playerLeftLeg!: THREE.Group;
  private playerRightLeg!: THREE.Group;
  private playerShadow!: THREE.Mesh;

  private currentLane: Lane = 1; // 0: Left (-3), 1: Center (0), 2: Right (3)
  private playerX: number = 0;
  private targetPlayerX: number = 0;
  private playerY: number = 0;
  private playerVy: number = 0;
  private isGrounded: boolean = true;
  private isSliding: boolean = false;
  private slideTimer: number = 0;
  private readonly SLIDE_DURATION: number = 0.65; // seconds
  private readonly GRAVITY: number = -38;
  private readonly JUMP_VELOCITY: number = 13.5;
  private readonly SUPER_JUMP_VELOCITY: number = 19.5;

  // Running Animation
  private runAnimTime: number = 0;

  // Camera Shake & Follow
  private cameraTrauma: number = 0;
  private baseCameraOffset = new THREE.Vector3(0, 4.3, 6.8);
  private baseLookOffset = new THREE.Vector3(0, 1.6, -12);

  // Speed & Progression
  private readonly BASE_SPEED: number = 24;
  private readonly MAX_SPEED: number = 54;
  private currentSpeed: number = 24;
  private distanceRun: number = 0;
  private coinsCollected: number = 0;
  private score: number = 0;
  private highScore: number = 0;

  // Power-ups
  private activePowerup: PowerupType | null = null;
  private powerupTimeRemaining: number = 0;
  private readonly POWERUP_DURATION: number = 10; // seconds

  // World Generation & Recycling
  private chunkLength: number = 60;
  private chunkCount: number = 7;
  private chunks: THREE.Group[] = [];
  private nextChunkZ: number = 30; // Starts slightly behind player and builds forward (negative Z)

  // Obstacles, Coins & Pickups
  private obstacles: ObstacleData[] = [];
  private coins: CoinData[] = [];
  private powerups: PowerupData[] = [];
  private nextEntityId: number = 1;

  // Particles
  private particles: Particle[] = [];
  private particleGroup!: THREE.Group;

  // Materials & Geometries Cache (reused for performance)
  private materials!: {
    trackBallast: THREE.MeshStandardMaterial;
    railMetal: THREE.MeshStandardMaterial;
    sleeperWood: THREE.MeshStandardMaterial;
    barrierOrange: THREE.MeshStandardMaterial;
    barrierWhite: THREE.MeshStandardMaterial;
    girderSteel: THREE.MeshStandardMaterial;
    signalLightRed: THREE.MeshBasicMaterial;
    signalLightYellow: THREE.MeshBasicMaterial;
    trainBody: THREE.MeshStandardMaterial;
    trainRoof: THREE.MeshStandardMaterial;
    trainWindshield: THREE.MeshStandardMaterial;
    trainLight: THREE.MeshBasicMaterial;
    coinGold: THREE.MeshStandardMaterial;
    magnetBlue: THREE.MeshStandardMaterial;
    sneakerGreen: THREE.MeshStandardMaterial;
    multiplierPink: THREE.MeshStandardMaterial;
    building1: THREE.MeshStandardMaterial;
    building2: THREE.MeshStandardMaterial;
    buildingWindow: THREE.MeshBasicMaterial;
    treeFoliage: THREE.MeshStandardMaterial;
    treeTrunk: THREE.MeshStandardMaterial;
  };

  // Reusable bounding boxes for zero-garbage collision checks
  private playerBox: THREE.Box3 = new THREE.Box3();
  private coinBox: THREE.Box3 = new THREE.Box3();

  // Input Handling
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartTime: number = 0;

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.highScore = Number(localStorage.getItem('subway_runner_highscore') || '0');

    this.initThree();
    this.initMaterials();
    this.createPlayer();
    this.initWorld();
    this.bindEvents();

    this.clock = new THREE.Clock();
    this.clock.start();
    this.animate();
  }

  private initThree() {
    // Scene
    this.scene = new THREE.Scene();
    // Warm retro-sunset / arcade night sky with exponential fog
    this.scene.background = new THREE.Color(0x19102c);
    this.scene.fog = new THREE.FogExp2(0x19102c, 0.009);

    // Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 800);
    this.camera.position.set(0, 4.3, 6.8);
    this.camera.lookAt(0, 1.6, -12);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x7c6d9c, 1.2);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffdf9e, 1.8);
    sunLight.position.set(25, 45, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 160;
    sunLight.shadow.camera.left = -22;
    sunLight.shadow.camera.right = 22;
    sunLight.shadow.camera.top = 25;
    sunLight.shadow.camera.bottom = -25;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.7);
    fillLight.position.set(-25, 20, -20);
    this.scene.add(fillLight);

    // Particle Group
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);
  }

  private initMaterials() {
    this.materials = {
      trackBallast: new THREE.MeshStandardMaterial({
        color: 0x242434,
        roughness: 0.9,
        metalness: 0.1,
      }),
      railMetal: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.85,
        roughness: 0.25,
      }),
      sleeperWood: new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.8,
        metalness: 0.1,
      }),
      barrierOrange: new THREE.MeshStandardMaterial({
        color: 0xf97316,
        roughness: 0.4,
        metalness: 0.1,
      }),
      barrierWhite: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.1,
      }),
      girderSteel: new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.7,
        roughness: 0.4,
      }),
      signalLightRed: new THREE.MeshBasicMaterial({ color: 0xef4444 }),
      signalLightYellow: new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
      trainBody: new THREE.MeshStandardMaterial({
        color: 0x0284c7, // vibrant subway blue
        roughness: 0.35,
        metalness: 0.4,
      }),
      trainRoof: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5,
        metalness: 0.3,
      }),
      trainWindshield: new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        roughness: 0.1,
        metalness: 0.9,
      }),
      trainLight: new THREE.MeshBasicMaterial({ color: 0xfef08a }),
      coinGold: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0xd97706,
        emissiveIntensity: 0.3,
      }),
      magnetBlue: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.7,
        roughness: 0.2,
        emissive: 0x0284c7,
        emissiveIntensity: 0.4,
      }),
      sneakerGreen: new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        metalness: 0.5,
        roughness: 0.3,
        emissive: 0x16a34a,
        emissiveIntensity: 0.4,
      }),
      multiplierPink: new THREE.MeshStandardMaterial({
        color: 0xec4899,
        metalness: 0.6,
        roughness: 0.2,
        emissive: 0xdb2777,
        emissiveIntensity: 0.4,
      }),
      building1: new THREE.MeshStandardMaterial({
        color: 0x1e1b4b,
        roughness: 0.85,
        metalness: 0.1,
      }),
      building2: new THREE.MeshStandardMaterial({
        color: 0x311042,
        roughness: 0.85,
        metalness: 0.1,
      }),
      buildingWindow: new THREE.MeshBasicMaterial({
        color: 0xfef08a,
      }),
      treeFoliage: new THREE.MeshStandardMaterial({
        color: 0x15803d,
        roughness: 0.7,
        flatShading: true,
      }),
      treeTrunk: new THREE.MeshStandardMaterial({
        color: 0x54361e,
        roughness: 0.9,
      }),
    };
  }

  // CREATE CHARACTER (Stylized low-poly runner with hoodie, cap, backpack, sneakers)
  private createPlayer() {
    this.playerGroup = new THREE.Group();

    // Player Shadow (soft circular blob directly under player)
    const shadowGeo = new THREE.CircleGeometry(0.7, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.playerShadow.position.y = 0.04;
    this.playerGroup.add(this.playerShadow);

    // Torso (cool streetwear hoodie)
    const torsoGeo = new THREE.BoxGeometry(0.75, 0.85, 0.45);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4, // Cyan hoodie
      roughness: 0.5,
      metalness: 0.1,
    });
    this.playerTorso = new THREE.Mesh(torsoGeo, torsoMat);
    this.playerTorso.position.y = 1.05;
    this.playerTorso.castShadow = true;
    this.playerTorso.receiveShadow = true;
    this.playerGroup.add(this.playerTorso);

    // Hoodie detail (zipper stripe)
    const zipGeo = new THREE.BoxGeometry(0.08, 0.82, 0.04);
    const zipMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const zipMesh = new THREE.Mesh(zipGeo, zipMat);
    zipMesh.position.set(0, 0, 0.22);
    this.playerTorso.add(zipMesh);

    // Backpack / Jetpack
    const packGeo = new THREE.BoxGeometry(0.5, 0.6, 0.25);
    const packMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
    const backpack = new THREE.Mesh(packGeo, packMat);
    backpack.position.set(0, 0.05, -0.32);
    backpack.castShadow = true;
    this.playerTorso.add(backpack);

    // Head
    const headGeo = new THREE.BoxGeometry(0.52, 0.52, 0.52);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.6 }); // skin tone
    this.playerHead = new THREE.Mesh(headGeo, headMat);
    this.playerHead.position.set(0, 1.7, 0);
    this.playerHead.castShadow = true;
    this.playerGroup.add(this.playerHead);

    // Baseball Cap (backward)
    const capGeo = new THREE.BoxGeometry(0.56, 0.22, 0.56);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.4 }); // neon red/rose
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(0, 0.2, 0);
    this.playerHead.add(cap);

    // Cap Visor (pointing backward)
    const visorGeo = new THREE.BoxGeometry(0.48, 0.06, 0.25);
    const visor = new THREE.Mesh(visorGeo, capMat);
    visor.position.set(0, 0.12, -0.36);
    this.playerHead.add(visor);

    // Sunglasses / Visor
    const glassesGeo = new THREE.BoxGeometry(0.44, 0.14, 0.1);
    const glassesMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 });
    const glasses = new THREE.Mesh(glassesGeo, glassesMat);
    glasses.position.set(0, 0.04, 0.26);
    this.playerHead.add(glasses);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x0891b2 }); // hoodie sleeve
    const handGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const handMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d });

    // Left Arm
    this.playerLeftArm = new THREE.Group();
    this.playerLeftArm.position.set(-0.48, 1.4, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.y = -0.28;
    leftArmMesh.castShadow = true;
    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.y = -0.62;
    this.playerLeftArm.add(leftArmMesh, leftHand);
    this.playerGroup.add(this.playerLeftArm);

    // Right Arm
    this.playerRightArm = new THREE.Group();
    this.playerRightArm.position.set(0.48, 1.4, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.y = -0.28;
    rightArmMesh.castShadow = true;
    const rightHand = new THREE.Mesh(handGeo, handMat);
    rightHand.position.y = -0.62;
    this.playerRightArm.add(rightArmMesh, rightHand);
    this.playerGroup.add(this.playerRightArm);

    // Legs & Sneakers
    const legGeo = new THREE.BoxGeometry(0.24, 0.55, 0.24);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b }); // dark cargo joggers
    const shoeGeo = new THREE.BoxGeometry(0.26, 0.2, 0.42);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 }); // white sneakers with red accents

    // Left Leg
    this.playerLeftLeg = new THREE.Group();
    this.playerLeftLeg.position.set(-0.22, 0.68, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, pantsMat);
    leftLegMesh.position.y = -0.25;
    leftLegMesh.castShadow = true;
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.55, 0.06);
    leftShoe.castShadow = true;
    this.playerLeftLeg.add(leftLegMesh, leftShoe);
    this.playerGroup.add(this.playerLeftLeg);

    // Right Leg
    this.playerRightLeg = new THREE.Group();
    this.playerRightLeg.position.set(0.22, 0.68, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, pantsMat);
    rightLegMesh.position.y = -0.25;
    rightLegMesh.castShadow = true;
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.55, 0.06);
    rightShoe.castShadow = true;
    this.playerRightLeg.add(rightLegMesh, rightShoe);
    this.playerGroup.add(this.playerRightLeg);

    this.playerGroup.position.set(0, 0, 0);
    this.scene.add(this.playerGroup);
  }

  // BUILD WORLD & RECYCLABLE TRACK CHUNKS
  private initWorld() {
    this.nextChunkZ = 20;
    for (let i = 0; i < this.chunkCount; i++) {
      this.spawnTrackChunk(this.nextChunkZ);
      this.nextChunkZ -= this.chunkLength;
    }
  }

  private spawnTrackChunk(centerZ: number) {
    const chunk = new THREE.Group();
    chunk.position.z = centerZ;

    const halfLen = this.chunkLength / 2;

    // 1. Ballast gravel ground bed
    const groundGeo = new THREE.BoxGeometry(11.5, 0.3, this.chunkLength);
    const ground = new THREE.Mesh(groundGeo, this.materials.trackBallast);
    ground.position.set(0, -0.15, 0);
    ground.receiveShadow = true;
    chunk.add(ground);

    // 2. Track Borders / Safety Curb
    const curbGeo = new THREE.BoxGeometry(0.4, 0.6, this.chunkLength);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 }); // yellow safety edge
    const leftCurb = new THREE.Mesh(curbGeo, curbMat);
    leftCurb.position.set(-5.6, 0.1, 0);
    const rightCurb = new THREE.Mesh(curbGeo, curbMat);
    rightCurb.position.set(5.6, 0.1, 0);
    chunk.add(leftCurb, rightCurb);

    // 3. Sleepers (wood/concrete cross ties) every 2.5 units
    const sleeperGeo = new THREE.BoxGeometry(9.6, 0.12, 0.8);
    const numSleepers = Math.floor(this.chunkLength / 2.5);
    for (let i = 0; i < numSleepers; i++) {
      const sz = -halfLen + i * 2.5 + 1.25;
      const sleeper = new THREE.Mesh(sleeperGeo, this.materials.sleeperWood);
      sleeper.position.set(0, 0.06, sz);
      sleeper.receiveShadow = true;
      chunk.add(sleeper);
    }

    // 4. Metal Rails (2 steel rails per lane, 6 rails total)
    const railGeo = new THREE.BoxGeometry(0.12, 0.16, this.chunkLength);
    LANE_X_POSITIONS.forEach((laneX) => {
      const rail1 = new THREE.Mesh(railGeo, this.materials.railMetal);
      rail1.position.set(laneX - 0.75, 0.15, 0);
      rail1.receiveShadow = true;
      const rail2 = new THREE.Mesh(railGeo, this.materials.railMetal);
      rail2.position.set(laneX + 0.75, 0.15, 0);
      rail2.receiveShadow = true;
      chunk.add(rail1, rail2);
    });

    // 5. Scenery along the flanks (Urban Skyline & Streetscapes)
    this.populateChunkScenery(chunk);

    this.scene.add(chunk);
    this.chunks.push(chunk);

    // Only spawn obstacles and collectibles ahead of starting zone (z < -30)
    if (centerZ < -30) {
      this.populateChunkEntities(centerZ);
    }
  }

  // Populate decorative city buildings, lights, and trees along tracks
  private populateChunkScenery(chunk: THREE.Group) {
    const halfLen = this.chunkLength / 2;
    const sides = [-1, 1];

    sides.forEach((side) => {
      // 2-3 Buildings per side
      for (let i = 0; i < 3; i++) {
        const bZ = -halfLen + i * 20 + 10;
        const bWidth = 8 + Math.random() * 6;
        const bHeight = 22 + Math.random() * 32;
        const bDepth = 14 + Math.random() * 8;
        const bX = side * (11 + bWidth / 2 + Math.random() * 2);

        const bMat = Math.random() > 0.5 ? this.materials.building1 : this.materials.building2;
        const buildingGeo = new THREE.BoxGeometry(bWidth, bHeight, bDepth);
        const building = new THREE.Mesh(buildingGeo, bMat);
        building.position.set(bX, bHeight / 2 - 0.5, bZ);
        building.castShadow = true;
        building.receiveShadow = true;
        chunk.add(building);

        // Glowing window grids on facade facing track
        const windowGeo = new THREE.PlaneGeometry(0.6, 0.9);
        const rows = Math.min(8, Math.floor(bHeight / 3.5));
        const cols = Math.min(3, Math.floor(bDepth / 4));
        for (let r = 2; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (Math.random() > 0.35) {
              const win = new THREE.Mesh(windowGeo, this.materials.buildingWindow);
              win.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
              win.position.set(
                side * (-bWidth / 2 - 0.05),
                r * 3.5 - bHeight / 2 + 1,
                (c - (cols - 1) / 2) * 3
              );
              building.add(win);
            }
          }
        }
      }

      // Overhead Subway Signal Arch / Gantry spanning the track at chunk middle
      if (Math.random() > 0.4) {
        const arch = this.createSubwayArch();
        arch.position.set(0, 0, 0);
        chunk.add(arch);
      }

      // Street Lamps & Trees near track edges
      for (let j = 0; j < 3; j++) {
        const lampZ = -halfLen + j * 20 + 5;
        const lampX = side * 6.5;

        // Street lamp pole
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6);
        const pole = new THREE.Mesh(poleGeo, this.materials.girderSteel);
        pole.position.set(lampX, 2.25, lampZ);
        pole.castShadow = true;
        chunk.add(pole);

        // Lamp light fixture
        const bulbGeo = new THREE.SphereGeometry(0.25, 8, 8);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(lampX - side * 0.4, 4.4, lampZ);
        chunk.add(bulb);

        // Low-poly Tree
        const treeX = side * (8.5 + Math.random() * 2);
        const treeZ = -halfLen + j * 20 + 14;
        const tree = this.createLowPolyTree();
        tree.position.set(treeX, 0, treeZ);
        chunk.add(tree);
      }
    });
  }

  private createSubwayArch(): THREE.Group {
    const arch = new THREE.Group();

    // Vertical posts
    const postGeo = new THREE.BoxGeometry(0.5, 6.5, 0.5);
    const leftPost = new THREE.Mesh(postGeo, this.materials.girderSteel);
    leftPost.position.set(-5.6, 3.25, 0);
    const rightPost = new THREE.Mesh(postGeo, this.materials.girderSteel);
    rightPost.position.set(5.6, 3.25, 0);

    // Cross beam high above tracks (safe clearance > 5.5m)
    const beamGeo = new THREE.BoxGeometry(11.8, 0.6, 0.6);
    const crossBeam = new THREE.Mesh(beamGeo, this.materials.girderSteel);
    crossBeam.position.set(0, 6.2, 0);

    // Overhead neon highway banner / sign
    const signGeo = new THREE.BoxGeometry(5.5, 1.2, 0.15);
    const signMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.3,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.3,
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 5.0, 0);

    arch.add(leftPost, rightPost, crossBeam, sign);
    return arch;
  }

  private createLowPolyTree(): THREE.Group {
    const tree = new THREE.Group();
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 1.8, 5);
    const trunk = new THREE.Mesh(trunkGeo, this.materials.treeTrunk);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    tree.add(trunk);

    // Foliage cones
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.2, 5), this.materials.treeFoliage);
    c1.position.y = 2.4;
    c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 5), this.materials.treeFoliage);
    c2.position.y = 3.6;
    c2.castShadow = true;
    tree.add(c1, c2);

    return tree;
  }

  // PROCEDURAL OBSTACLES, COINS & POWERUPS
  private populateChunkEntities(chunkCenterZ: number) {
    const halfLen = this.chunkLength / 2;
    // We split each 60m chunk into 2-3 obstacle sections
    const sectionZ1 = chunkCenterZ + 15;
    const sectionZ2 = chunkCenterZ - 15;

    [sectionZ1, sectionZ2].forEach((secZ) => {
      this.generateObstacleSection(secZ);
    });
  }

  private generateObstacleSection(atZ: number) {
    // Choose 1 or 2 lanes for obstacles (always ensure at least 1 lane is free and navigable!)
    const allLanes: Lane[] = [0, 1, 2];
    const shuffledLanes = [...allLanes].sort(() => Math.random() - 0.5);

    // 60% chance 2 obstacles, 40% chance 1 obstacle
    const obstacleCount = Math.random() > 0.4 ? 2 : 1;
    const chosenLanes = shuffledLanes.slice(0, obstacleCount);

    chosenLanes.forEach((lane) => {
      // Pick obstacle type:
      // a) Barrier (Low hurdle - jump over)
      // b) Girder (High signal beam - slide under)
      // c) Train (Full height block - switch lanes)
      const roll = Math.random();
      let type: ObstacleType = 'barrier';
      if (roll < 0.38) {
        type = 'barrier';
      } else if (roll < 0.72) {
        type = 'girder';
      } else {
        type = 'train';
      }

      this.spawnObstacle(type, lane, atZ);
    });

    // Spawn coins in open lane or above jumpable hurdles!
    const openLanes = allLanes.filter((l) => !chosenLanes.includes(l));
    if (openLanes.length > 0) {
      const coinLane = openLanes[Math.floor(Math.random() * openLanes.length)];
      // Spawn line of 4-6 coins
      this.spawnCoinLine(coinLane, atZ - 8, atZ + 8, 5, 0.85);

      // 18% chance to spawn a powerup pickup in the open lane!
      if (Math.random() < 0.18) {
        const types: PowerupType[] = ['magnet', 'sneakers', 'multiplier'];
        const pType = types[Math.floor(Math.random() * types.length)];
        this.spawnPowerup(pType, coinLane, atZ - 16);
      }
    }

    // If there is a barrier, spawn an arc of coins over it to reward jumping!
    chosenLanes.forEach((lane) => {
      const hasBarrier = this.obstacles.find((o) => o.lane === lane && o.z === atZ && o.type === 'barrier');
      if (hasBarrier) {
        this.spawnCoinArc(lane, atZ - 6, atZ + 6, 5);
      }
    });
  }

  // 1. Barrier: Low road barricade (must jump over, height ~1.0)
  private createBarrierMesh(): THREE.Group {
    const group = new THREE.Group();

    // Two striped crossbars
    const barGeo = new THREE.BoxGeometry(2.4, 0.28, 0.12);
    const orangeBar = new THREE.Mesh(barGeo, this.materials.barrierOrange);
    orangeBar.position.y = 0.95;
    orangeBar.castShadow = true;

    const whiteBar = new THREE.Mesh(barGeo, this.materials.barrierWhite);
    whiteBar.position.y = 0.58;
    whiteBar.castShadow = true;

    // Diagonal stripes on barrier
    const stripeGeo = new THREE.BoxGeometry(0.28, 0.3, 0.14);
    for (let s = -0.8; s <= 0.8; s += 0.5) {
      const sMesh = new THREE.Mesh(stripeGeo, this.materials.barrierOrange);
      sMesh.position.set(s, 0.58, 0);
      group.add(sMesh);
    }

    // Two support legs
    const legGeo = new THREE.BoxGeometry(0.18, 1.05, 0.18);
    const leftLeg = new THREE.Mesh(legGeo, this.materials.girderSteel);
    leftLeg.position.set(-1.05, 0.52, 0);
    leftLeg.castShadow = true;

    const rightLeg = new THREE.Mesh(legGeo, this.materials.girderSteel);
    rightLeg.position.set(1.05, 0.52, 0);
    rightLeg.castShadow = true;

    // Flashing warning strobe on top
    const lightGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8);
    const lightMesh = new THREE.Mesh(lightGeo, this.materials.signalLightYellow);
    lightMesh.position.set(0, 1.15, 0);

    group.add(orangeBar, whiteBar, leftLeg, rightLeg, lightMesh);
    return group;
  }

  // 2. High Overhead Girder: Overhead railway signal beam (clearance ~1.4, must slide under)
  private createGirderMesh(): THREE.Group {
    const group = new THREE.Group();

    // Side metal uprights
    const postGeo = new THREE.BoxGeometry(0.24, 3.8, 0.24);
    const leftPost = new THREE.Mesh(postGeo, this.materials.girderSteel);
    leftPost.position.set(-1.3, 1.9, 0);
    leftPost.castShadow = true;

    const rightPost = new THREE.Mesh(postGeo, this.materials.girderSteel);
    rightPost.position.set(1.3, 1.9, 0);
    rightPost.castShadow = true;

    // Heavy overhead girder beam: sits from y = 1.35 to 2.35 (clearance below is 1.35m)
    // Standing runner is 1.85m -> hits! Sliding runner is 0.72m -> passes cleanly!
    const beamGeo = new THREE.BoxGeometry(2.7, 0.9, 0.4);
    const girderBeam = new THREE.Mesh(beamGeo, this.materials.girderSteel);
    girderBeam.position.set(0, 1.85, 0);
    girderBeam.castShadow = true;

    // Hazard caution stripes on girder beam
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
    const hazardGeo = new THREE.BoxGeometry(2.72, 0.18, 0.42);
    const hazard = new THREE.Mesh(hazardGeo, hazardMat);
    hazard.position.set(0, 1.5, 0);

    // Red warning signal lamps
    const lampGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const lamp1 = new THREE.Mesh(lampGeo, this.materials.signalLightRed);
    lamp1.position.set(-0.6, 2.0, 0.22);
    const lamp2 = new THREE.Mesh(lampGeo, this.materials.signalLightRed);
    lamp2.position.set(0.6, 2.0, 0.22);

    group.add(leftPost, rightPost, girderBeam, hazard, lamp1, lamp2);
    return group;
  }

  // 3. Train: Full-height passenger subway car (blocks entire lane, must switch lanes)
  private createTrainMesh(): THREE.Group {
    const group = new THREE.Group();

    const trainLen = 9.5;
    const trainWidth = 2.4;
    const trainHeight = 3.2;

    // Main train car body
    const bodyGeo = new THREE.BoxGeometry(trainWidth, trainHeight - 0.4, trainLen);
    const body = new THREE.Mesh(bodyGeo, this.materials.trainBody);
    body.position.set(0, trainHeight / 2 + 0.2, 0);
    body.castShadow = true;
    body.receiveShadow = true;

    // Train roof curve / top cap
    const roofGeo = new THREE.BoxGeometry(trainWidth - 0.1, 0.4, trainLen + 0.2);
    const roof = new THREE.Mesh(roofGeo, this.materials.trainRoof);
    roof.position.set(0, trainHeight + 0.2, 0);
    roof.castShadow = true;

    // Front windshield (facing the incoming runner at +z)
    const windowGeo = new THREE.BoxGeometry(1.8, 0.9, 0.2);
    const frontWindow = new THREE.Mesh(windowGeo, this.materials.trainWindshield);
    frontWindow.position.set(0, trainHeight / 2 + 0.5, trainLen / 2 + 0.02);

    // Front headlights
    const lightGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10);
    lightGeo.rotateX(Math.PI / 2);
    const leftLight = new THREE.Mesh(lightGeo, this.materials.trainLight);
    leftLight.position.set(-0.75, 0.7, trainLen / 2 + 0.05);
    const rightLight = new THREE.Mesh(lightGeo, this.materials.trainLight);
    rightLight.position.set(0.75, 0.7, trainLen / 2 + 0.05);

    // Front cowcatcher / bumper grill
    const grillGeo = new THREE.BoxGeometry(2.2, 0.4, 0.3);
    const grillMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const grill = new THREE.Mesh(grillGeo, grillMat);
    grill.position.set(0, 0.3, trainLen / 2 + 0.05);

    // Side windows
    const sideWinGeo = new THREE.BoxGeometry(0.1, 0.7, 1.4);
    for (let w = -3; w <= 3; w += 2.2) {
      const leftWin = new THREE.Mesh(sideWinGeo, this.materials.trainWindshield);
      leftWin.position.set(-trainWidth / 2 - 0.02, 2.0, w);
      const rightWin = new THREE.Mesh(sideWinGeo, this.materials.trainWindshield);
      rightWin.position.set(trainWidth / 2 + 0.02, 2.0, w);
      group.add(leftWin, rightWin);
    }

    group.add(body, roof, frontWindow, leftLight, rightLight, grill);
    return group;
  }

  private spawnObstacle(type: ObstacleType, lane: Lane, z: number) {
    const laneX = LANE_X_POSITIONS[lane];
    let mesh: THREE.Group;
    const box = new THREE.Box3();

    if (type === 'barrier') {
      mesh = this.createBarrierMesh();
      mesh.position.set(laneX, 0, z);
      // Hitbox: y: [0 to 1.15], x: [laneX ± 1.1], z: [z ± 0.35]
      box.set(
        new THREE.Vector3(laneX - 1.05, 0, z - 0.3),
        new THREE.Vector3(laneX + 1.05, 1.15, z + 0.3)
      );
    } else if (type === 'girder') {
      mesh = this.createGirderMesh();
      mesh.position.set(laneX, 0, z);
      // High overhead beam hitbox: sits at y from 1.35 to 2.45
      // Standing player has height 1.85 -> collides! Sliding player has height 0.72 -> ducks under!
      box.set(
        new THREE.Vector3(laneX - 1.25, 1.35, z - 0.35),
        new THREE.Vector3(laneX + 1.25, 2.5, z + 0.35)
      );
    } else {
      // Train
      mesh = this.createTrainMesh();
      mesh.position.set(laneX, 0, z);
      // Train length is 9.5
      box.set(
        new THREE.Vector3(laneX - 1.15, 0, z - 4.6),
        new THREE.Vector3(laneX + 1.15, 3.5, z + 4.6)
      );
    }

    this.scene.add(mesh);
    this.obstacles.push({
      id: this.nextEntityId++,
      type,
      lane,
      z,
      mesh,
      box,
      passed: false,
    });
  }

  // Collectible 3D Rotating Gold Coins
  private createCoinMesh(): THREE.Mesh {
    // 12-segment cylinder rotated to face forward
    const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
    geo.rotateZ(Math.PI / 2);
    const coin = new THREE.Mesh(geo, this.materials.coinGold);
    coin.castShadow = true;
    return coin;
  }

  private spawnCoinLine(lane: Lane, startZ: number, endZ: number, count: number, y: number = 0.85) {
    const laneX = LANE_X_POSITIONS[lane];
    const stepZ = (endZ - startZ) / (count - 1);

    for (let i = 0; i < count; i++) {
      const z = startZ + i * stepZ;
      const mesh = this.createCoinMesh();
      mesh.position.set(laneX, y, z);
      this.scene.add(mesh);

      this.coins.push({
        id: this.nextEntityId++,
        lane,
        x: laneX,
        y,
        z,
        mesh,
        collected: false,
      });
    }
  }

  // Coin arc over low hurdles
  private spawnCoinArc(lane: Lane, startZ: number, endZ: number, count: number) {
    const laneX = LANE_X_POSITIONS[lane];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const z = startZ + t * (endZ - startZ);
      // Parabolic jump arc peak at 2.4m
      const y = 0.85 + Math.sin(t * Math.PI) * 1.6;

      const mesh = this.createCoinMesh();
      mesh.position.set(laneX, y, z);
      this.scene.add(mesh);

      this.coins.push({
        id: this.nextEntityId++,
        lane,
        x: laneX,
        y,
        z,
        mesh,
        collected: false,
      });
    }
  }

  // Power-up Pickups (Magnet, Super Sneakers, 2X Multiplier)
  private spawnPowerup(type: PowerupType, lane: Lane, z: number) {
    const laneX = LANE_X_POSITIONS[lane];
    const group = new THREE.Group();
    const y = 1.2;

    if (type === 'magnet') {
      // Horseshoe Magnet
      const magnetGeo = new THREE.TorusGeometry(0.38, 0.12, 8, 16, Math.PI);
      const magnet = new THREE.Mesh(magnetGeo, this.materials.magnetBlue);
      magnet.rotation.z = Math.PI;
      group.add(magnet);
    } else if (type === 'sneakers') {
      // Glowing Winged Sneaker
      const bootGeo = new THREE.BoxGeometry(0.35, 0.45, 0.6);
      const boot = new THREE.Mesh(bootGeo, this.materials.sneakerGreen);
      group.add(boot);
    } else {
      // 2X Multiplier Star / Octagon
      const starGeo = new THREE.OctahedronGeometry(0.45, 0);
      const star = new THREE.Mesh(starGeo, this.materials.multiplierPink);
      group.add(star);
    }

    // Outer pulsating halo ring
    const haloGeo = new THREE.RingGeometry(0.55, 0.68, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: type === 'magnet' ? 0x38bdf8 : type === 'sneakers' ? 0x22c55e : 0xec4899,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.name = 'halo';
    group.add(halo);

    group.position.set(laneX, y, z);
    this.scene.add(group);

    this.powerups.push({
      id: this.nextEntityId++,
      type,
      lane,
      x: laneX,
      y,
      z,
      mesh: group,
      collected: false,
    });
  }

  // PARTICLE SYSTEM (Coin sparkles, powerup bursts, crash impact debris)
  private spawnCoinParticles(x: number, y: number, z: number, colorHex: number = 0xfacc15) {
    const particleCount = 12;
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });

    for (let i = 0; i < particleCount; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.particleGroup.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 2 + Math.random() * 5,
        vz: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
        color: new THREE.Color(colorHex),
      });
    }
  }

  private spawnCrashParticles(x: number, y: number, z: number) {
    const particleCount = 28;
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);

    for (let i = 0; i < particleCount; i++) {
      const color = Math.random() > 0.5 ? 0xf97316 : 0x06b6d4;
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 0.5, z);
      this.particleGroup.add(mesh);

      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 12,
        vy: 4 + Math.random() * 10,
        vz: (Math.random() - 0.5) * 12,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
        color: new THREE.Color(color),
      });
    }
  }

  // PLAYER CONTROLS & LANE SWITCHING
  public shiftLane(direction: -1 | 1) {
    if (!this.isRunning || this.isPaused || this.isGameOver) return;
    const newLane = (this.currentLane + direction) as Lane;
    if (newLane >= 0 && newLane <= 2) {
      this.currentLane = newLane;
      this.targetPlayerX = LANE_X_POSITIONS[newLane];
      soundManager.playClick();
    }
  }

  public jump() {
    if (!this.isRunning || this.isPaused || this.isGameOver) return;
    if (this.isGrounded) {
      const jumpImpulse = this.activePowerup === 'sneakers' ? this.SUPER_JUMP_VELOCITY : this.JUMP_VELOCITY;
      this.playerVy = jumpImpulse;
      this.isGrounded = false;
      this.isSliding = false; // Jumping cancels slide
      soundManager.playJump();
    }
  }

  public slide() {
    if (!this.isRunning || this.isPaused || this.isGameOver) return;

    if (!this.isGrounded) {
      // Fast drop downward impulse if sliding mid-air!
      this.playerVy = -26;
      soundManager.playSlide();
      return;
    }

    this.isSliding = true;
    this.slideTimer = this.SLIDE_DURATION;
    soundManager.playSlide();
  }

  // GAME LIFECYCLE
  public startGame() {
    soundManager.init();
    soundManager.startMusic();
    this.resetState();
    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;
  }

  public restartGame() {
    this.startGame();
  }

  public togglePause(): boolean {
    if (!this.isRunning || this.isGameOver) return false;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      soundManager.stopMusic();
    } else {
      soundManager.startMusic();
    }
    return this.isPaused;
  }

  private resetState() {
    this.currentLane = 1;
    this.playerX = 0;
    this.targetPlayerX = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.isGrounded = true;
    this.isSliding = false;
    this.slideTimer = 0;
    this.currentSpeed = this.BASE_SPEED;
    this.distanceRun = 0;
    this.coinsCollected = 0;
    this.score = 0;
    this.activePowerup = null;
    this.powerupTimeRemaining = 0;
    this.cameraTrauma = 0;

    // Reset player transform & mesh
    this.playerGroup.position.set(0, 0, 0);
    this.playerGroup.rotation.set(0, 0, 0);
    this.playerTorso.rotation.set(0, 0, 0);
    this.playerTorso.scale.set(1, 1, 1);
    this.playerHead.position.set(0, 1.7, 0);

    // Clear active obstacles, coins & powerups
    this.obstacles.forEach((o) => this.scene.remove(o.mesh));
    this.obstacles = [];
    this.coins.forEach((c) => this.scene.remove(c.mesh));
    this.coins = [];
    this.powerups.forEach((p) => this.scene.remove(p.mesh));
    this.powerups = [];

    // Clear particles
    this.particles.forEach((p) => this.particleGroup.remove(p.mesh));
    this.particles = [];

    // Reset track chunks
    this.chunks.forEach((c) => this.scene.remove(c));
    this.chunks = [];
    this.initWorld();
  }

  private triggerGameOver() {
    this.isRunning = false;
    this.isGameOver = true;
    this.cameraTrauma = 1.0;
    soundManager.playCrash();
    soundManager.stopMusic();

    this.spawnCrashParticles(this.playerX, this.playerY, this.playerGroup.position.z);

    // Dramatic stumble / ragdoll tilt
    this.playerGroup.rotation.x = -Math.PI / 3;
    this.playerGroup.rotation.z = (Math.random() - 0.5) * 0.8;
    this.playerGroup.position.y = 0.2;

    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('subway_runner_highscore', this.highScore.toString());
    }

    this.callbacks.onGameOver({
      score: this.score,
      distance: Math.floor(this.distanceRun),
      coins: this.coinsCollected,
      speed: Math.floor(this.currentSpeed),
      multiplier: this.activePowerup === 'multiplier' ? 2 : 1,
      activePowerup: this.activePowerup,
      powerupTimer: 0,
      highScore: this.highScore,
    });
  }

  // TICK & ANIMATE LOOP
  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    if (this.isRunning && !this.isPaused && !this.isGameOver) {
      this.updateGame(delta);
    }

    this.updateParticles(delta);
    this.updateCamera(delta);

    this.renderer.render(this.scene, this.camera);
  };

  private updateGame(delta: number) {
    // 1. Speed Progression
    // Speed increases gradually over distance from 24 up to 54
    this.currentSpeed = Math.min(this.MAX_SPEED, this.BASE_SPEED + (this.distanceRun / 1000) * 4);
    const speedMult = this.activePowerup === 'multiplier' ? 2 : 1;
    this.distanceRun += this.currentSpeed * delta;
    this.score = Math.floor(this.distanceRun * speedMult + this.coinsCollected * 15 * speedMult);

    // 2. Power-up Timer Update
    if (this.activePowerup) {
      this.powerupTimeRemaining -= delta;
      if (this.powerupTimeRemaining <= 0) {
        this.activePowerup = null;
        this.powerupTimeRemaining = 0;
      }
    }

    // 3. Move Player Forward along Z (in world space, moving in -Z direction)
    const moveZ = this.currentSpeed * delta;
    this.playerGroup.position.z -= moveZ;

    // 4. Smooth Horizontal Lane Interpolation (Lerp)
    const lerpSpeed = 16;
    this.playerX += (this.targetPlayerX - this.playerX) * Math.min(1, delta * lerpSpeed);
    this.playerGroup.position.x = this.playerX;

    // Banking tilt when switching lanes
    const dx = this.targetPlayerX - this.playerX;
    this.playerGroup.rotation.z = -dx * 0.18; // Lean into the turn!

    // 5. Jump Physics & Vertical Movement
    if (!this.isGrounded) {
      this.playerVy += this.GRAVITY * delta;
      this.playerY += this.playerVy * delta;

      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVy = 0;
        this.isGrounded = true;
      }
    }
    this.playerGroup.position.y = this.playerY;

    // 6. Sliding Mechanic
    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        // Restore player dimensions
        this.playerTorso.scale.set(1, 1, 1);
        this.playerTorso.position.y = 1.05;
        this.playerHead.position.set(0, 1.7, 0);
        this.playerTorso.rotation.x = 0;
      } else {
        // Flatten and tilt player forward
        const slideProgress = this.slideTimer / this.SLIDE_DURATION;
        this.playerTorso.scale.set(1, 0.45, 1.3);
        this.playerTorso.position.y = 0.55;
        this.playerHead.position.set(0, 0.85, 0.25);
        this.playerTorso.rotation.x = -Math.PI / 4;
      }
    }

    // 7. Character Running Procedural Animation
    this.runAnimTime += delta * (this.currentSpeed * 0.4);
    if (this.isGrounded && !this.isSliding) {
      const bob = Math.abs(Math.sin(this.runAnimTime * 2)) * 0.12;
      this.playerTorso.position.y = 1.05 + bob;
      this.playerHead.position.y = 1.7 + bob;

      // Leg swing in opposition
      const legAngle = Math.sin(this.runAnimTime) * 0.75;
      this.playerLeftLeg.rotation.x = legAngle;
      this.playerRightLeg.rotation.x = -legAngle;

      // Arm swing in opposition to legs
      this.playerLeftArm.rotation.x = -legAngle * 0.85;
      this.playerRightArm.rotation.x = legAngle * 0.85;
    } else if (!this.isGrounded) {
      // In air jump pose
      this.playerLeftArm.rotation.x = -1.2;
      this.playerRightArm.rotation.x = -1.2;
      this.playerLeftLeg.rotation.x = 0.4;
      this.playerRightLeg.rotation.x = -0.3;
    }

    // Shadow size modulation with jump height
    const shadowScale = Math.max(0.2, 1 - this.playerY * 0.18);
    this.playerShadow.scale.set(shadowScale, shadowScale, 1);

    // 8. Chunks Recycling
    this.recycleChunks();

    // 9. Coin Magnet pull & rotation
    this.updateCoins(delta);

    // 10. Powerup rotation & update
    this.updatePowerups(delta);

    // 11. Collision Detection (AABB)
    this.checkCollisions();

    // 12. Notify React HUD
    this.callbacks.onStatsUpdate({
      score: this.score,
      distance: Math.floor(this.distanceRun),
      coins: this.coinsCollected,
      speed: Math.floor(this.currentSpeed),
      multiplier: this.activePowerup === 'multiplier' ? 2 : 1,
      activePowerup: this.activePowerup,
      powerupTimer: Math.ceil(this.powerupTimeRemaining),
      highScore: this.highScore,
    });
  }

  // RECYCLE CHUNKS BEHIND PLAYER & SPAWN AHEAD
  private recycleChunks() {
    const playerZ = this.playerGroup.position.z;

    // If oldest chunk is more than 50 units behind player, recycle it ahead
    const oldestChunk = this.chunks[0];
    if (oldestChunk && oldestChunk.position.z > playerZ + 45) {
      this.scene.remove(oldestChunk);
      this.chunks.shift();

      // Spawn next chunk ahead
      this.spawnTrackChunk(this.nextChunkZ);
      this.nextChunkZ -= this.chunkLength;
    }

    // Clean up passed obstacles & coins
    this.obstacles = this.obstacles.filter((obs) => {
      if (obs.mesh.position.z > playerZ + 25) {
        this.scene.remove(obs.mesh);
        return false;
      }
      return true;
    });

    this.coins = this.coins.filter((coin) => {
      if (coin.mesh.position.z > playerZ + 25 || coin.collected) {
        this.scene.remove(coin.mesh);
        return false;
      }
      return true;
    });

    this.powerups = this.powerups.filter((pow) => {
      if (pow.mesh.position.z > playerZ + 25 || pow.collected) {
        this.scene.remove(pow.mesh);
        return false;
      }
      return true;
    });
  }

  // UPDATE COINS & MAGNET LOGIC
  private updateCoins(delta: number) {
    const playerPos = this.playerGroup.position;
    const isMagnetActive = this.activePowerup === 'magnet';
    const magnetRadius = 14;

    this.coins.forEach((coin) => {
      if (coin.collected) return;

      // Constant rotation
      coin.mesh.rotation.y += delta * 4;

      // If magnet active, attract coins towards player!
      if (isMagnetActive) {
        const dist = coin.mesh.position.distanceTo(playerPos);
        if (dist < magnetRadius) {
          coin.mesh.position.lerp(playerPos, delta * 12);
        }
      }
    });
  }

  // UPDATE POWERUP PICKUPS
  private updatePowerups(delta: number) {
    this.powerups.forEach((pow) => {
      if (pow.collected) return;
      pow.mesh.rotation.y += delta * 2.5;

      const halo = pow.mesh.getObjectByName('halo') as THREE.Mesh;
      if (halo) {
        halo.rotation.z += delta * 1.5;
      }
    });
  }

  // AABB COLLISION DETECTION
  private checkCollisions() {
    const pz = this.playerGroup.position.z;
    const px = this.playerX;
    const py = this.playerY;

    // Calculate dynamic player AABB
    if (this.isSliding) {
      // Flattened hitbox: height 0.72
      this.playerBox.set(
        new THREE.Vector3(px - 0.35, py, pz - 0.5),
        new THREE.Vector3(px + 0.35, py + 0.72, pz + 0.5)
      );
    } else {
      // Standing hitbox: height 1.85
      this.playerBox.set(
        new THREE.Vector3(px - 0.35, py, pz - 0.35),
        new THREE.Vector3(px + 0.35, py + 1.85, pz + 0.35)
      );
    }

    // 1. Coin Collisions
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const coinPos = coin.mesh.position;
      const distZ = Math.abs(coinPos.z - pz);

      if (distZ < 1.4) {
        this.coinBox.set(
          new THREE.Vector3(coinPos.x - 0.45, coinPos.y - 0.45, coinPos.z - 0.45),
          new THREE.Vector3(coinPos.x + 0.45, coinPos.y + 0.45, coinPos.z + 0.45)
        );

        if (this.playerBox.intersectsBox(this.coinBox)) {
          coin.collected = true;
          this.coinsCollected++;
          soundManager.playCoin();
          this.spawnCoinParticles(coinPos.x, coinPos.y, coinPos.z, 0xfacc15);
          this.callbacks.onCoinCollected(this.coinsCollected);
        }
      }
    }

    // 2. Power-up Collisions
    for (const pow of this.powerups) {
      if (pow.collected) continue;
      const powPos = pow.mesh.position;
      const distZ = Math.abs(powPos.z - pz);

      if (distZ < 1.5) {
        const dist = powPos.distanceTo(new THREE.Vector3(px, py + 1.0, pz));
        if (dist < 1.3) {
          pow.collected = true;
          this.activePowerup = pow.type;
          this.powerupTimeRemaining = this.POWERUP_DURATION;
          soundManager.playPowerup();
          const pColor = pow.type === 'magnet' ? 0x38bdf8 : pow.type === 'sneakers' ? 0x22c55e : 0xec4899;
          this.spawnCoinParticles(powPos.x, powPos.y, powPos.z, pColor);
          this.callbacks.onPowerupAcquired(pow.type);
        }
      }
    }

    // 3. Obstacle Collisions
    for (const obs of this.obstacles) {
      // Quick Z distance cull
      const distZ = obs.z - pz;
      // Train has length 9.5, others ~1.0
      const maxZCheck = obs.type === 'train' ? 6.0 : 2.5;

      if (Math.abs(distZ) < maxZCheck) {
        // Fair hitbox tolerance: inset obstacle box slightly (10%) to reward close dodges
        if (this.playerBox.intersectsBox(obs.box)) {
          this.triggerGameOver();
          break;
        }
      }
    }
  }

  // PARTICLES UPDATE
  private updateParticles(delta: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;

      if (p.life >= p.maxLife) {
        this.particleGroup.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      p.vy += this.GRAVITY * 0.5 * delta;
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.y += p.vy * delta;
      p.mesh.position.z += p.vz * delta;

      const progress = p.life / p.maxLife;
      const scale = Math.max(0.01, 1 - progress);
      p.mesh.scale.set(scale, scale, scale);
    }
  }

  // DYNAMIC CAMERA WITH SCREEN SHAKE
  private updateCamera(delta: number) {
    const targetX = this.playerX * 0.42;
    const targetY = this.playerY * 0.35;
    const targetZ = this.playerGroup.position.z;

    let shakeX = 0;
    let shakeY = 0;
    if (this.cameraTrauma > 0) {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - delta * 1.5);
      const shakeAmount = this.cameraTrauma * this.cameraTrauma * 0.6;
      shakeX = (Math.random() * 2 - 1) * shakeAmount;
      shakeY = (Math.random() * 2 - 1) * shakeAmount;
    }

    this.camera.position.set(
      targetX + this.baseCameraOffset.x + shakeX,
      targetY + this.baseCameraOffset.y + shakeY,
      targetZ + this.baseCameraOffset.z
    );

    this.camera.lookAt(
      targetX * 0.6 + this.baseLookOffset.x,
      targetY * 0.5 + this.baseLookOffset.y,
      targetZ + this.baseLookOffset.z
    );
  }

  // EVENT BINDINGS (KEYBOARD, TOUCH & RESIZE)
  private bindEvents() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);

    const el = this.container;
    el.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    el.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    el.addEventListener('mousedown', this.handleMouseDown);
    el.addEventListener('mouseup', this.handleMouseUp);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Prevent default scrolling on arrow keys and space
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    if (e.code === 'KeyP' || e.code === 'Escape') {
      this.togglePause();
      return;
    }

    if (this.isGameOver) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') {
        this.restartGame();
      }
      return;
    }

    if (!this.isRunning) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        this.startGame();
      }
      return;
    }

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.shiftLane(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.shiftLane(1);
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        this.jump();
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.slide();
        break;
    }
  };

  private handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
  };

  private handleTouchEnd = (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const dt = Date.now() - this.touchStartTime;

    this.processSwipeGesture(dx, dy, dt);
  };

  private handleMouseDown = (e: MouseEvent) => {
    this.touchStartX = e.clientX;
    this.touchStartY = e.clientY;
    this.touchStartTime = Date.now();
  };

  private handleMouseUp = (e: MouseEvent) => {
    const dx = e.clientX - this.touchStartX;
    const dy = e.clientY - this.touchStartY;
    const dt = Date.now() - this.touchStartTime;

    this.processSwipeGesture(dx, dy, dt);
  };

  private processSwipeGesture(dx: number, dy: number, dt: number) {
    if (!this.isRunning) {
      if (dt < 400 && Math.hypot(dx, dy) < 40) {
        if (this.isGameOver) {
          this.restartGame();
        } else {
          this.startGame();
        }
      }
      return;
    }

    const minSwipeDist = 28;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > minSwipeDist || absY > minSwipeDist) {
      if (absX > absY) {
        // Horizontal swipe
        if (dx > 0) {
          this.shiftLane(1);
        } else {
          this.shiftLane(-1);
        }
      } else {
        // Vertical swipe
        if (dy < 0) {
          this.jump();
        } else {
          this.slide();
        }
      }
    }
  }

  private handleResize = () => {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    soundManager.stopMusic();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);

    const el = this.container;
    el.removeEventListener('touchstart', this.handleTouchStart);
    el.removeEventListener('touchend', this.handleTouchEnd);
    el.removeEventListener('mousedown', this.handleMouseDown);
    el.removeEventListener('mouseup', this.handleMouseUp);

    this.renderer.dispose();
    if (el.contains(this.renderer.domElement)) {
      el.removeChild(this.renderer.domElement);
    }
  }
}
