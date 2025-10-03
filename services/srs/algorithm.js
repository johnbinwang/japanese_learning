/**
 * SRS (Spaced Repetition System) 算法
 */

class SRSAlgorithm {
  constructor() {
    // 间隔序列 (毫秒): 0, 10分钟, 1天, 3天, 7天, 14天, 30天
    this.intervals = [
      0,
      10 * 60 * 1000,
      24 * 60 * 60 * 1000,
      3 * 24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
      14 * 24 * 60 * 60 * 1000,
      30 * 24 * 60 * 60 * 1000
    ];
  }

  /**
   * 计算下次复习时间
   * @param {number} streak - 当前连击数
   * @param {string} feedback - 反馈 ('again', 'hard', 'good', 'easy')
   * @returns {Object} { newStreak, dueAt }
   */
  calculateNextDue(streak, feedback = 'good') {
    let newStreak = streak;

    switch (feedback) {
      case 'again':
        newStreak = 0;
        break;
      case 'hard':
        newStreak = Math.max(0, streak - 1);
        break;
      case 'good':
        newStreak = streak + 1;
        break;
      case 'easy':
        newStreak = streak + 2;
        break;
    }

    const intervalIndex = Math.min(newStreak, this.intervals.length - 1);
    const interval = this.intervals[intervalIndex];
    const dueAt = new Date(Date.now() + interval);

    return { newStreak, dueAt };
  }
}

module.exports = SRSAlgorithm;
