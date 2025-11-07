/**
 * 动词变形引擎
 */

class VerbConjugator {
  /**
   * 规范化动词分组格式
   */
  static normalizeGroup(group) {
    if (!group) return '';

    const cleaned = (group || '').toString().replace(/\s+/g, '').toUpperCase();

    // I类动词
    if (['I', '1', 'TYPE1', 'TYPEI', 'GROUP_I', 'GROUP1', 'GROUPI', 'CLASS_I', 'CLASS1', 'CLASSI', 'VERB1', 'VERBI'].includes(cleaned)) {
      return 'I';
    }

    // II类动词
    if (['II', '2', 'TYPE2', 'TYPEII', 'GROUP_II', 'GROUP2', 'GROUPII', 'CLASS_II', 'CLASS2', 'CLASSII', 'VERB2', 'VERBII'].includes(cleaned)) {
      return 'II';
    }

    // 不规则动词
    if (['IRR', 'IRREGULAR', 'III', '3', 'TYPE3', 'TYPEIII', 'GROUP_III', 'GROUP3', 'GROUPIII', 'CLASS_III', 'CLASS3', 'CLASSIII', 'VERB3', 'VERBIII'].includes(cleaned)) {
      return 'IRR';
    }

    return cleaned;
  }

  /**
   * ます形变形
   */
  static conjugateToMasu(verb, group) {
    if (verb === 'する') return 'します';
    if (verb === '来る' || verb === 'くる') return 'きます';

    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'します';
    }

    const normalizedGroup = this.normalizeGroup(group);

    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const iRow = { 'く': 'き', 'ぐ': 'ぎ', 'す': 'し', 'つ': 'ち', 'ぬ': 'に', 'ぶ': 'び', 'む': 'み', 'る': 'り', 'う': 'い' };
      return stem + (iRow[lastChar] || 'い') + 'ます';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'ます';
    }
    return verb + 'ます';
  }

  /**
   * て形变形
   */
  static conjugateToTe(verb, group) {
    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'して';
    }

    if (verb === '来る' || verb === 'くる') return 'きて';

    const normalizedGroup = this.normalizeGroup(group);

    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      if (lastChar === 'く') {
        return stem + 'いて';
      } else if (lastChar === 'ぐ') {
        return stem + 'いで';
      } else if (lastChar === 'す') {
        return stem + 'して';
      } else if (['つ', 'う', 'る'].includes(lastChar)) {
        return stem + 'って';
      } else if (['ぬ', 'ぶ', 'む'].includes(lastChar)) {
        return stem + 'んで';
      }
      return stem + 'って';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'て';
    } else if (normalizedGroup === 'IRR' || normalizedGroup === 'III') {
      if (verb === 'する') return 'して';
      if (verb === '来る' || verb === 'くる') return 'きて';
      if (verb === '行く' || verb === 'いく') return 'いって';
      if (verb.endsWith('する')) {
        return verb.slice(0, -2) + 'して';
      }
    }

    return this.intelligentTeConjugation(verb);
  }

  /**
   * 智能て形变形推断
   */
  static intelligentTeConjugation(verb) {
    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'して';
    }

    if (verb === '来る' || verb === 'くる') return 'きて';
    if (verb === '行く' || verb === 'いく') return 'いって';
    if (verb === 'する') return 'して';

    const lastChar = verb.slice(-1);
    const stem = verb.slice(0, -1);

    if (lastChar === 'る') {
      const secondLastChar = verb.slice(-2, -1);
      const iRow = ['い', 'き', 'ぎ', 'し', 'じ', 'ち', 'に', 'ひ', 'び', 'ぴ', 'み', 'り'];
      const eRow = ['え', 'け', 'げ', 'せ', 'ぜ', 'て', 'で', 'ね', 'へ', 'べ', 'ぺ', 'め', 'れ'];

      const knownIIClassPatterns = [
        'べる', 'める', 'ける', 'せる', 'てる', 'ねる', 'へる', 'れる', 'げる', 'ぜる', 'でる', 'ぺる',
        'びる', 'みる', 'きる', 'しる', 'ちる', 'にる', 'ひる', 'りる', 'ぎる', 'じる', 'ぢる', 'ぴる'
      ];

      const knownIIClassVerbs = [
        '見る', '食べる', '寝る', '起きる', '着る', '降りる', '借りる', '受ける', '答える', '考える',
        '教える', '覚える', '忘れる', '出る', '入れる', '捨てる', '疲れる', '慣れる', '生まれる'
      ];

      const lastTwoChars = verb.slice(-2);
      const matchesIIPattern = knownIIClassPatterns.includes(lastTwoChars) || knownIIClassVerbs.includes(verb);

      if (iRow.includes(secondLastChar) || eRow.includes(secondLastChar) || matchesIIPattern) {
        return stem + 'て';
      } else {
        return stem + 'って';
      }
    } else {
      if (lastChar === 'く') {
        return stem + 'いて';
      } else if (lastChar === 'ぐ') {
        return stem + 'いで';
      } else if (lastChar === 'す') {
        return stem + 'して';
      } else if (['つ', 'う'].includes(lastChar)) {
        return stem + 'って';
      } else if (['ぬ', 'ぶ', 'む'].includes(lastChar)) {
        return stem + 'んで';
      }
    }

    return stem + 'って';
  }

  /**
   * た形变形
   */
  static conjugateToTa(verb, group) {
    if (verb === 'する') return 'した';
    if (verb === '来る' || verb === 'くる') return 'きた';

    const normalizedGroup = this.normalizeGroup(group);

    if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'た';
    }

    const teForm = this.conjugateToTe(verb, group);
    return teForm.replace(/て$/, 'た').replace(/で$/, 'だ');
  }

  /**
   * ない形变形
   */
  static conjugateToNai(verb, group) {
    if (verb === 'する') return 'しない';
    if (verb === '来る' || verb === 'くる') return 'こない';
    if (verb === 'ある') return 'ない';

    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'しない';
    }

    const normalizedGroup = this.normalizeGroup(group);

    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const aRow = { 'く': 'か', 'ぐ': 'が', 'す': 'さ', 'つ': 'た', 'ぬ': 'な', 'ぶ': 'ば', 'む': 'ま', 'る': 'ら', 'う': 'わ' };
      return stem + (aRow[lastChar] || 'わ') + 'ない';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'ない';
    } else if (normalizedGroup === 'III' || normalizedGroup === 'IRR') {
      if (verb === 'する') return 'しない';
      if (verb === '来る' || verb === 'くる') return 'こない';
      if (verb === '行く' || verb === 'いく') return 'いかない';
      return verb + 'ない';
    }

    if (verb.endsWith('い')) {
      const verbExceptions = ['立つ', '待つ', '持つ', '打つ', '勝つ', '死ぬ', '呼ぶ', '遊ぶ', '結ぶ', '読む', '住む', '泳ぐ', '働く', '歩く', '書く', '聞く'];
      const isDefinitelyVerb = verb.endsWith('る') || verb.endsWith('う') || verb.endsWith('く') || verb.endsWith('ぐ') ||
                              verb.endsWith('す') || verb.endsWith('つ') || verb.endsWith('ぬ') || verb.endsWith('ぶ') ||
                              verb.endsWith('む') || verbExceptions.includes(verb);

      if (!isDefinitelyVerb) {
        if (verb === 'いい') return 'よくない';
        return verb.slice(0, -1) + 'くない';
      }
    }

    return verb + 'ない';
  }

  /**
   * 可能形变形
   */
  static conjugateToPotential(verb, group) {
    if (verb === 'する') return 'できる';
    if (verb === '来る' || verb === 'くる') return 'こられる';

    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'できる';
    }

    const normalizedGroup = this.normalizeGroup(group);

    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const eRow = { 'く': 'け', 'ぐ': 'げ', 'す': 'せ', 'つ': 'て', 'ぬ': 'ね', 'ぶ': 'べ', 'む': 'め', 'る': 'れ', 'う': 'え' };
      return stem + (eRow[lastChar] || 'え') + 'る';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'られる';
    }
    return verb + 'られる';
  }

  /**
   * 意志形变形
   */
  static conjugateToVolitional(verb, group) {
    if (verb === 'する') return 'しよう';
    if (verb === '来る' || verb === 'くる') return 'こよう';

    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'しよう';
    }

    const normalizedGroup = this.normalizeGroup(group);

    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const oRow = { 'く': 'こ', 'ぐ': 'ご', 'す': 'そ', 'つ': 'と', 'ぬ': 'の', 'ぶ': 'ぼ', 'む': 'も', 'る': 'ろ', 'う': 'お' };
      return stem + (oRow[lastChar] || 'お') + 'う';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'よう';
    }
    return verb + 'よう';
  }

  /**
   * 命令形变形
   */
  static conjugateToImperative(verb, group) {
    if (verb === 'する') return 'しろ';
    if (verb === '来る' || verb === 'くる') return 'こい';

    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'しろ';
    }

    const normalizedGroup = this.normalizeGroup(group);

    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const eRow = { 'く': 'け', 'ぐ': 'げ', 'す': 'せ', 'つ': 'て', 'ぬ': 'ね', 'ぶ': 'べ', 'む': 'め', 'る': 'れ', 'う': 'え' };
      return stem + (eRow[lastChar] || 'え');
    } else if (normalizedGroup === 'II') {
      if (verb.endsWith('る')) {
        return verb.slice(0, -1) + 'ろ';
      }
      return verb + 'ろ';
    }

    return verb + 'ろ';
  }

  /**
   * 获取变形说明
   */
  static getExplanation(form, group) {
    const normalizedGroup = this.normalizeGroup(group);

    const explanations = {
      'masu': normalizedGroup === 'I' ? 'I类动词ます形:词尾变i段+ます(如:飲む→飲みます)' : normalizedGroup === 'II' ? 'II类动词ます形:去る+ます(如:食べる→食べます)' : '不规则动词ます形',
      'te': normalizedGroup === 'I' ? 'I类动词て形:く→いて,ぐ→いで,む/ぶ/ぬ→んで,る/う/つ→って,す→して' : normalizedGroup === 'II' ? 'II类动词て形:去る+て(如:食べる→食べて)' : '不规则动词て形',
      'nai': normalizedGroup === 'I' ? 'I类动词ない形:词尾变a段+ない(如:飲む→飲まない)' : normalizedGroup === 'II' ? 'II类动词ない形:去る+ない(如:食べる→食べない)' : '不规则动词ない形',
      'ta': normalizedGroup === 'I' ? 'I类动词た形:る/う/つ→った,ぶ/む/ぬ→んだ,く→いた,ぐ→いだ,す→した(如:つくる→作った)' : normalizedGroup === 'II' ? 'II类动词た形:去る+た(如:食べる→食べた)' : '不规则动词た形',
      'potential': normalizedGroup === 'I' ? 'I类动词可能形:词尾变e段+る(如:飲む→飲める)' : normalizedGroup === 'II' ? 'II类动词可能形:去る+られる(如:食べる→食べられる)' : '不规则动词可能形',
      'volitional': normalizedGroup === 'I' ? 'I类动词意志形:词尾变o段+う(如:飲む→飲もう)' : normalizedGroup === 'II' ? 'II类动词意志形:去る+よう(如:食べる→食べよう)' : '不规则动词意志形',
      'imperative': normalizedGroup === 'I' ? 'I类动词命令形:词尾变e段(如:飲む→飲め)' : normalizedGroup === 'II' ? 'II类动词命令形:去る+ろ(如:食べる→食べろ)' : '不规则动词命令形:する→しろ, 来る→こい'
    };
    return explanations[form] || '基本形';
  }
}

module.exports = VerbConjugator;
