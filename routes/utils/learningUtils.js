/**
 * 学习功能工具函数
 */

const ConjugationEngine = require('../../services/conjugation');
const pool = require('../../db/pool');

// 文本清理函数
function cleanWordText(text) {
  if (!text) return text;
  return String(text).replace(/\s*[\(（]?\d+[\)）]?\s*$/, '').trim();
}

// 模块配置
function getModuleConfig(module) {
  const configs = {
    verb: {
      itemType: 'vrb',
      tableName: 'verbs',
      defaultForms: ['masu', 'te', 'nai', 'ta', 'imperative']
    },
    adj: {
      itemType: 'adj',
      tableName: 'adjectives',
      defaultForms: ['negative', 'past', 'past_negative', 'adverb']
    },
    plain: {
      itemType: null,
      tableName: 'plain',
      defaultForms: ['plain_present', 'plain_past', 'plain_negative']
    }
  };
  return configs[module] || configs.plain;
}

// 解析表单参数
function parseFormsParam(forms) {
  return forms ? forms.split(',').map(f => f.trim()).filter(Boolean) : [];
}

// 获取启用的表单
function getEnabledForms(selectedForms, settings, defaultForms) {
  if (Array.isArray(selectedForms) && selectedForms.length > 0) {
    return selectedForms;
  }

  const fallback = Array.isArray(settings.enabledForms) ? settings.enabledForms : [];
  const filtered = fallback.filter(formId => defaultForms.includes(formId));

  if (filtered.length > 0) {
    return filtered;
  }

  return defaultForms;
}

// 生成正确答案
function generateCorrectAnswer(normalizedItemType, item, form) {
  if (normalizedItemType === 'pln') {
    if (item.item_type === 'adj') {
      const processedItem = { ...item, type: (item.adj_type || item.type || item.type_info || '').trim() };
      return ConjugationEngine.conjugateAdjective(processedItem, form);
    } else {
      const processedItem = { ...item, group: (item.group || item.group_type || item.type_info || '').trim() };
      switch (form) {
        case 'plain_present':
          return processedItem.kana;
        case 'plain_past':
          return ConjugationEngine.conjugateVerb(processedItem.kana, processedItem.group, 'ta');
        case 'plain_negative':
          return ConjugationEngine.conjugateVerb(processedItem.kana, processedItem.group, 'nai');
        case 'plain_past_negative':
          const naiForm = ConjugationEngine.conjugateVerb(processedItem.kana, processedItem.group, 'nai');
          return naiForm.replace(/ない$/, 'なかった');
        default:
          return processedItem.kana;
      }
    }
  } else if (normalizedItemType === 'adj') {
    return ConjugationEngine.conjugateAdjective(item, form);
  } else {
    return ConjugationEngine.conjugateVerb(item.kana, item.group, form);
  }
}

// 汉字版本答案
function generateKanjiAnswer(normalizedItemType, item, form) {
  if (!item.kanji) return null;

  if (normalizedItemType === 'pln') {
    if (item.item_type === 'adj') {
      const processedItem = {
        kana: item.kana,
        kanji: item.kanji,
        type: (item.adj_type || item.type || item.type_info || '').trim()
      };
      return ConjugationEngine.conjugateAdjective(processedItem, form);
    } else {
      const processedItem = { ...item, group: (item.group || item.group_type || item.type_info || '').trim() };
      const baseWord = processedItem.kanji || processedItem.kana;
      switch (form) {
        case 'plain_present':
          return baseWord;
        case 'plain_past':
          return ConjugationEngine.conjugateVerb(baseWord, processedItem.group, 'ta');
        case 'plain_negative':
          return ConjugationEngine.conjugateVerb(baseWord, processedItem.group, 'nai');
        case 'plain_past_negative':
          const naiFormKanji = ConjugationEngine.conjugateVerb(baseWord, processedItem.group, 'nai');
          return naiFormKanji.replace(/ない$/, 'なかった');
        default:
          return baseWord;
      }
    }
  } else if (normalizedItemType === 'adj') {
    const processedItem = {
      kana: item.kana,
      kanji: item.kanji,
      type: (item.type || '').trim()
    };
    return ConjugationEngine.conjugateAdjective(processedItem, form);
  } else {
    const baseWord = item.kanji || item.kana;
    return ConjugationEngine.conjugateVerb(baseWord, item.group, form);
  }
}

// 标准化 itemType
function normalizeItemType(itemType) {
  return itemType.toUpperCase() === 'VRB' || itemType.toLowerCase() === 'verb' ? 'vrb' :
         itemType.toUpperCase() === 'ADJ' || itemType.toLowerCase() === 'adjective' ? 'adj' :
         itemType.toUpperCase() === 'PLN' || itemType.toLowerCase() === 'plain' ? 'pln' :
         itemType.toLowerCase();
}

// 获取学习项数据
async function getItemData(normalizedItemType, itemId) {
  let tableName;
  if (normalizedItemType === 'pln') {
    tableName = 'plain';
  } else if (normalizedItemType === 'adj') {
    tableName = 'adjectives';
  } else {
    tableName = 'verbs';
  }

  const sql = `SELECT * FROM ${tableName} WHERE id = $1`;
  const { rows: itemRows } = await pool.query(sql, [itemId]);

  if (itemRows.length === 0) {
    throw new Error('题目不存在');
  }

  return itemRows[0];
}

// 验证答案
function validateAnswer(mode, feedback, userAnswer, correctAnswer, item, normalizedItemType, form) {
  if (mode === 'flashcard') {
    return feedback === 'good' || feedback === 'easy';
  }

  const trimmedUserAnswer = userAnswer ? userAnswer.trim() : '';

  if (trimmedUserAnswer === correctAnswer) {
    return true;
  }

  const kanjiCorrectAnswer = generateKanjiAnswer(normalizedItemType, item, form);
  if (kanjiCorrectAnswer && trimmedUserAnswer === kanjiCorrectAnswer) {
    return true;
  }

  // 复合动词特殊处理
  if (normalizedItemType === 'pln' && item.item_type !== 'adj') {
    const kana = item.kana || '';
    const kanji = item.kanji || '';
    const hasParticle = /[にをでへとから]/.test(kana);

    if (hasParticle) {
      const kanaVerbMatch = kana.match(/([^にをでへとから]+)$/);
      const kanjiVerbMatch = kanji.match(/([^にをでへとから]+)$/);

      if (kanaVerbMatch) {
        const verbKana = kanaVerbMatch[1];
        const processedItem = { ...item, group: (item.group || item.group_type || item.type_info || '').trim() };

        let verbOnlyAnswer = '';
        switch (form) {
          case 'plain_present':
            verbOnlyAnswer = verbKana;
            break;
          case 'plain_past':
            verbOnlyAnswer = ConjugationEngine.conjugateVerb(verbKana, processedItem.group, 'ta');
            break;
          case 'plain_negative':
            verbOnlyAnswer = ConjugationEngine.conjugateVerb(verbKana, processedItem.group, 'nai');
            break;
          case 'plain_past_negative':
            const naiForm = ConjugationEngine.conjugateVerb(verbKana, processedItem.group, 'nai');
            verbOnlyAnswer = naiForm.replace(/ない$/, 'なかった');
            break;
          default:
            verbOnlyAnswer = verbKana;
        }

        if (trimmedUserAnswer === verbOnlyAnswer) {
          return true;
        }
      }

      if (kanjiVerbMatch) {
        const verbKanji = kanjiVerbMatch[1];
        const processedItem = { ...item, group: (item.group || item.group_type || item.type_info || '').trim() };

        let verbOnlyKanjiAnswer = '';
        switch (form) {
          case 'plain_present':
            verbOnlyKanjiAnswer = verbKanji;
            break;
          case 'plain_past':
            verbOnlyKanjiAnswer = ConjugationEngine.conjugateVerb(verbKanji, processedItem.group, 'ta');
            break;
          case 'plain_negative':
            verbOnlyKanjiAnswer = ConjugationEngine.conjugateVerb(verbKanji, processedItem.group, 'nai');
            break;
          case 'plain_past_negative':
            const naiFormKanji = ConjugationEngine.conjugateVerb(verbKanji, processedItem.group, 'nai');
            verbOnlyKanjiAnswer = naiFormKanji.replace(/ない$/, 'なかった');
            break;
          default:
            verbOnlyKanjiAnswer = verbKanji;
        }

        if (trimmedUserAnswer === verbOnlyKanjiAnswer) {
          return true;
        }
      }
    }
  }

  return false;
}

// 获取解释
function getExplanation(normalizedItemType, item, form) {
  if (normalizedItemType === 'adj') {
    return ConjugationEngine.getExplanation(normalizedItemType, form, null, item.type);
  } else if (normalizedItemType === 'pln') {
    if (item.item_type === 'adj') {
      return ConjugationEngine.getExplanation('adj', form, null, item.adj_type);
    } else {
      return ConjugationEngine.getExplanation('pln', form, (item.group_type || '').trim(), null);
    }
  } else {
    const rawBase = item.kanji || item.kana;
    const base = rawBase.replace(/\d+$/, '');
    let groupForExplanation = item.group_type;
    if (!groupForExplanation || groupForExplanation.trim() === '') {
      groupForExplanation = ConjugationEngine.normalizeGroup(base);
    } else {
      groupForExplanation = groupForExplanation.trim();
    }
    return ConjugationEngine.getExplanation(normalizedItemType, form, groupForExplanation, null);
  }
}

module.exports = {
  cleanWordText,
  getModuleConfig,
  parseFormsParam,
  getEnabledForms,
  generateCorrectAnswer,
  generateKanjiAnswer,
  normalizeItemType,
  getItemData,
  validateAnswer,
  getExplanation
};
