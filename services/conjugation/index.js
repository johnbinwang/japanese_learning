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
