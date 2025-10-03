/**
 * 形容词变形引擎
 */

class AdjectiveConjugator {
  /**
   * 形容词变形主入口
   */
  static conjugate(adj, form) {
    const { kana, kanji, type } = adj;
    const rawBase = kanji || kana;
    const base = rawBase.replace(/\d+$/, '');

    const normalizedType = (type || '').trim();

    if (normalizedType === 'i') {
      return this.conjugateI(base, form);
    } else if (normalizedType === 'na') {
      return this.conjugateNa(base, form);
    }
    return base;
  }

  /**
   * i形容词变形
   */
  static conjugateI(adj, form) {
    const stem = adj.slice(0, -1);

    switch (form) {
      case 'negative':
      case 'plain_negative':
        return adj === 'いい' ? 'よくない' : stem + 'くない';
      case 'past':
      case 'plain_past':
        return adj === 'いい' ? 'よかった' : stem + 'かった';
      case 'past_negative':
      case 'plain_past_negative':
        return adj === 'いい' ? 'よくなかった' : stem + 'くなかった';
      case 'adverb':
        return adj === 'いい' ? 'よく' : stem + 'く';
      case 'te':
        return adj === 'いい' ? 'よくて' : stem + 'くて';
      default:
        return adj;
    }
  }

  /**
   * na形容词变形
   */
  static conjugateNa(adj, form) {
    const base = adj.replace(/な$/, '').replace(/だ$/, '').replace(/の$/, '').replace(/である$/, '');

    switch (form) {
      case 'negative':
      case 'plain_negative':
        return base + 'じゃない';
      case 'past':
      case 'plain_past':
        return base + 'だった';
      case 'past_negative':
      case 'plain_past_negative':
        return base + 'じゃなかった';
      case 'adverb':
        return base + 'に';
      case 'rentai':
        return base + 'な';
      case 'te':
        return base + 'で';
      case 'plain_present':
      default:
        return base + 'だ';
    }
  }

  /**
   * 获取变形说明
   */
  static getExplanation(form, type) {
    const explanations = {
      'negative': type === 'i' ? 'i形容词否定形:去い+くない(如:高い→高くない)' : 'na形容词否定形:+じゃない(如:きれい→きれいじゃない)',
      'past': type === 'i' ? 'i形容词过去形:去い+かった(如:高い→高かった)' : 'na形容词过去形:+だった(如:きれい→きれいだった)',
      'past_negative': type === 'i' ? 'i形容词过去否定形:去い+くなかった(如:高い→高くなかった)' : 'na形容词过去否定形:+じゃなかった(如:きれい→きれいじゃなかった)',
      'adverb': type === 'i' ? 'i形容词副词形:去い+く(如:高い→高く)' : 'na形容词副词形:+に(如:きれい→きれいに)',
      'te': type === 'i' ? 'i形容词て形:去い+くて(如:高い→高くて)' : 'na形容词て形:+で(如:きれい→きれいで)',
      'rentai': 'na形容词连体形:+な(如:きれい→きれいな)'
    };
    return explanations[form] || '基本形';
  }
}

module.exports = AdjectiveConjugator;
