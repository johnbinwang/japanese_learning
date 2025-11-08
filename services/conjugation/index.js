/**
 * 变形引擎主入口
 */

const VerbConjugator = require('./verbConjugator');
const AdjectiveConjugator = require('./adjectiveConjugator');

class ConjugationEngine {
  /**
   * 动词变形
   */
  static conjugateVerb(verb, group, form) {
    switch (form) {
      case 'masu':
        return VerbConjugator.conjugateToMasu(verb, group);
      case 'te':
        return VerbConjugator.conjugateToTe(verb, group);
      case 'nai':
        return VerbConjugator.conjugateToNai(verb, group);
      case 'ta':
        return VerbConjugator.conjugateToTa(verb, group);
      case 'potential':
        return VerbConjugator.conjugateToPotential(verb, group);
      case 'volitional':
        return VerbConjugator.conjugateToVolitional(verb, group);
      case 'imperative':
        return VerbConjugator.conjugateToImperative(verb, group);
      default:
        return verb;
    }
  }

  /**
   * 形容词变形
   */
  static conjugateAdjective(adj, form) {
    return AdjectiveConjugator.conjugate(adj, form);
  }

  /**
   * 获取变形说明
   */
  static getExplanation(itemType, form, group = null, type = null) {
    if (itemType === 'vrb') {
      return VerbConjugator.getExplanation(form, group);
    } else if (itemType === 'pln') {
      const explanations = {
        'plain_present': '简体现在形:动词原形,不变化',
        'plain_past': '简体过去形:I类动词る/う/つ→った,ぶ/む/ぬ→んだ,く→いた,ぐ→いだ,す→した;II类动词去る+た',
        'plain_negative': '简体否定形:I类动词词尾变a段+ない,II类动词去る+ない',
        'plain_past_negative': '简体过去否定形:ない形的ない→なかった'
      };
      return explanations[form] || '简体形式';
    } else if (itemType === 'pol') {
      if (type) {
        const cleanType = (type || '').trim().toLowerCase();
        const isIAdj = cleanType === 'i';
        const adjExplanations = {
          'polite_present': isIAdj ? '敬体现在形(i形容词):原形+です(如:高い→高いです)' : '敬体现在形(na形容词):词干+です(如:静か→静かです)',
          'polite_past': isIAdj ? '敬体过去形(i形容词):去い+かったです(如:高い→高かったです)' : '敬体过去形(na形容词):词干+でした(如:静か→静かでした)',
          'polite_negative': isIAdj ? '敬体否定形(i形容词):去い+くありません(如:高い→高くありません)' : '敬体否定形(na形容词):词干+ではありません(如:静か→静かではありません)',
          'polite_past_negative': isIAdj ? '敬体过去否定形(i形容词):去い+くありませんでした' : '敬体过去否定形(na形容词):词干+ではありませんでした'
        };
        return adjExplanations[form] || '敬体形式';
      }

      const explanations = {
        'polite_present': '敬体现在形(ます形):I类动词词尾变i段+ます,II类动词去る+ます,する→します,来る→きます',
        'polite_past': '敬体过去形:ます形结尾ます→ました',
        'polite_negative': '敬体否定形:ます形结尾ます→ません',
        'polite_past_negative': '敬体过去否定形:ます形结尾ます→ませんでした'
      };
      return explanations[form] || '敬体形式';
    } else if (itemType === 'adj') {
      return AdjectiveConjugator.getExplanation(form, type);
    }
    return '基本形';
  }

  /**
   * 规范化动词分组
   */
  static normalizeGroup(group) {
    return VerbConjugator.normalizeGroup(group);
  }
}

module.exports = ConjugationEngine;
