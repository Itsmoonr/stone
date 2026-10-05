/**
 * Config toàn cục.
 */
window.AR_CONFIG = {
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.65,
  maxNumHands: 2,
  targetFPS: 24
};

/**
 * Companion — 2 nhân vật đi theo tay, giống hệt bản gốc.
 *   hand: 'left'  = tay TRÁI vật lý → naruto + rasengan
 *   hand: 'right' = tay PHẢI vật lý → sasuke + chidori
 */
window.COMPANION_CONFIG = [
  {
    id: 'naruto',
    video: 'assets/naruto.mp4',
    audio: 'assets/rasengan_last.mp3',
    hand: 'left',
    sizeCss: 'min(1600px, 125vw)'   // y hệt bản gốc (#n)
  },
  {
    id: 'sasuke',
    video: 'assets/sasuke.mp4',
    audio: 'assets/chidori.mp3',
    hand: 'right',
    sizeCss: 'min(2400px, 187.5vw)' // y hệt bản gốc (#s)
  }
];