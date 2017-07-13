import { mapState } from 'vuex';
import { remote } from 'electron';
import {
  SELECT_MUSIC_ACT,
  UPDATE_SIMPLE_MODE,
  UPDATE_CONFIG,
} from '~/store';
import styles from './styles';
import stage from '~/lib/stage';
const win = remote.getCurrentWindow();
const AC = new window.AudioContext();
const analyser = AC.createAnalyser();
const gainnode = AC.createGain();
const loopTypes = { normal: 0, single: 1, like: 2 };
const loopCount = Object.keys(loopTypes).length;
gainnode.gain.value = 1;

export default {
  name: 'music-player',
  data() {
    return {
      audioSource: null,
      bufferSource: null,
      loopTypes,
      audioStatus: {
        currentTime: 0,
        duration: 0,
        playing: false,
        loop: loopTypes.like,
        muted: false,
      },
      url: '',
      name: '',
    };
  },
  computed: {
    ...mapState([
      'currentId',
      'musicList',
      'playStyle',
      'simpleMode',
      'sourceConfig',
    ]),

    progress() {
      const status = this.audioStatus;
      return {
        width: status.currentTime
          ? Math.ceil((status.currentTime / status.duration) * 100) + '%'
          : '0',
      };
    },

    musicIndex() {
      return this.musicList.findIndex(item => item.id === this.currentId);
    },
  },
  watch: {
    currentId() {
      this.changeMusic(true);
    },
  },
  methods: {
    changeMusic(play) {
      const music = this.musicList[this.musicIndex];
      if (!music) {
        return;
      }

      // update music
      this.url = music.url;
      this.name = music.name;

      if (play) {
        this.$nextTick(() => {
          this.$refs.audio.load();
          this.$refs.audio.play();
        });
      }
    },

    play() {
      if (!this.url) {
        return this.next();
      }

      if (this.$refs.audio.paused) {
        this.$refs.audio.play();
      } else {
        this.$refs.audio.pause();
      }
    },

    // next music
    next() {
      const index = this.musicIndex + 1;
      this.$store.dispatch(
        SELECT_MUSIC_ACT,
        this.musicList[index >= this.musicList.length ? 0 : index].id,
      );
    },

    // next liked music
    nextLike() {
      const index = this.musicIndex;
      const len = this.musicList.length;
      let i = index;
      // found next liked music
      while (++i !== index) {
        if (this.musicList[i = i >= len ? 0 : i].liked) {
          break;
        }
      }

      if (i === index) {
        // replay music if can't found next liked music
        this.$refs.audio.currentTime = 0;
        this.$refs.audio.play();
      } else {
        this.$store.dispatch(SELECT_MUSIC_ACT, this.musicList[i].id);
      }
    },

    // prev music
    prev() {
      const index = this.musicIndex - 1;
      this.$store.dispatch(
        SELECT_MUSIC_ACT,
        this.musicList[index < 0 ? this.musicList.length - 1 : index].id,
      );
    },

    loop() {
      this.audioStatus.loop = (this.audioStatus.loop + 1) % loopCount;
      this.$refs.audio.loop = this.audioStatus.loop === loopTypes.single;
      this.$store.commit(UPDATE_CONFIG, { key: 'musicStatus.loop', value: this.audioStatus.loop });
    },

    mute() {
      this.$refs.audio.muted = this.audioStatus.muted = !this.audioStatus.muted;
      this.$store.commit(UPDATE_CONFIG, { key: 'musicStatus.muted', value: this.audioStatus.muted });
    },

    simple() {
      this.$store.commit(UPDATE_SIMPLE_MODE, !this.simpleMode);
    },

    // executed in every animation frame
    animate() {
      const arrayLength = analyser.frequencyBinCount;
      // get frequency from analyser node
      // frequency value is 0 ~ 255
      const array = new Uint8Array(arrayLength);
      analyser.getByteFrequencyData(array);
      styles[this.playStyle].update(array);
    },

    initAudio() {
      // connect audio to the destination
      const audio = this.$refs.audio;
      const source = AC.createMediaElementSource(this.$refs.audio);
      source.connect(analyser);
      analyser.connect(gainnode);
      gainnode.connect(AC.destination);

      audio.onended = () => {
        if (this.audioStatus.loop === loopTypes.normal) {
          this.next();
        } else if (this.audioStatus.loop === loopTypes.like) {
          this.nextLike();
        }
      };

      audio.ontimeupdate = () => {
        this.audioStatus.currentTime = audio.currentTime;
      };

      audio.onplaying = () => {
        this.audioStatus.playing = true;
        this.audioStatus.duration = audio.duration;
      };

      audio.onpause = () => {
        this.audioStatus.playing = false;
      };
    },

    initCanvas() {
      const canvas = this.$refs.canvas;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      styles[this.playStyle].init(canvas);
    },

    onResize() {
      // recalculate canvas size while window's size changed
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.initCanvas();
      }, 400);
    },

    syncStatus() {
      // read play status from cache
      Object.keys(this.audioStatus).forEach(key => {
        const statusKey = `musicStatus.${key}`;
        if (this.sourceConfig.hasOwnProperty(statusKey)) {
          this.audioStatus[key] = this.sourceConfig[statusKey];
        }
      });
    },
  },
  mounted() {
    this.initAudio();
    this.initCanvas();
    this.syncStatus();
    stage.add(this);
    win.on('resize', this.onResize.bind(this));
    this.$nextTick(() => {
      if (this.currentId) {
        this.changeMusic();
      }
    });
  },
  destroyed() {
    if (this.bufferSource) {
      this.bufferSource.stop();
    }

    win.removeListener('resize', this.onResize.bind(this));
  },
};
