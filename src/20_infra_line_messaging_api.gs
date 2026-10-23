// 返事を送る。options.quickReply があれば、最後のメッセージに付ける（H3）。
// カードが受けつけられなかったときは、黙らずに文字だけで送り、原因は LAST_LINE_ERRORS と EVENT_LOG に残す（H5）。
// 返事の合図（reply token）は1回しか使えないので、文字だけの送りなおしは push で（ユーザーの操作1回につき1回まで。G10）
function sendReplyMessage_(replyToken, messages, groupId, options) {
  if (!replyToken || !messages || messages.length === 0) {
    return;
  }

  const settings = options || {};
  const sender = groupId ? buildLineSenderByGroup_(groupId) : null;
  const prepared = messages.map(function(message) {
    return attachSenderToLineMessage_(message, sender);
  });
  if (settings.quickReply && settings.quickReply.items && settings.quickReply.items.length > 0) {
    prepared[prepared.length - 1] = Object.assign({}, prepared[prepared.length - 1], {
      quickReply: { items: settings.quickReply.items.slice(0, 13) },
    });
  }

  try {
    callLineApi_('post', 'https://api.line.me/v2/bot/message/reply', {
      replyToken: replyToken,
      messages: prepared,
    });
  } catch (error) {
    rememberLineError_('reply', error, prepared);
    const allText = prepared.every(function(message) {
      return message.type === 'text';
    });
    if (allText || !isLineBadRequestError_(error)) {
      throw error;
    }
    const fallbackText = prepared.map(function(message) {
      return message.type === 'text' ? message.text : buildFlexFallbackText_(message);
    }).filter(function(text) {
      return !!text;
    }).join('\n\n') || 'うまく表示できませんでした。';
    if (!groupId) {
      throw error;
    }
    callLineApi_('post', 'https://api.line.me/v2/bot/message/push', {
      to: groupId,
      messages: [Object.assign(attachSenderToLineMessage_({
        type: 'text',
        text: (fallbackText + '\n\n（カードを出せなかったので、文字だけで返しました）').slice(0, 4900),
      }, sender), prepared[prepared.length - 1].quickReply ? { quickReply: prepared[prepared.length - 1].quickReply } : {})],
    });
    appendEventLog_({
      eventType: 'reply',
      groupId: groupId || '',
      action: 'reply_flex_fallback',
      result: 'error',
      detail: 'flex rejected, pushed text instead',
      errorMessage: buildErrorMessage_(error).slice(0, 1000),
    });
  }
}

// カードの代わりの文字：altText と、ボタンの行き先（リンク）
function buildFlexFallbackText_(message) {
  const lines = [message.altText || ''];
  const seen = {};
  (function walk(node) {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (node.type === 'button' && node.action && node.action.type === 'uri' && node.action.uri && !seen[node.action.uri]) {
      seen[node.action.uri] = true;
      lines.push((node.action.label || '開く') + '：' + node.action.uri);
    }
    Object.keys(node).forEach(function(key) {
      walk(node[key]);
    });
  })(message.contents);
  return lines.filter(function(line) {
    return !!line;
  }).join('\n');
}

// LINE がメッセージの形を受けつけなかった（400）か。それ以外（トークンの期限切れなど）は文字にしても通らない
function isLineBadRequestError_(error) {
  return /LINE API error 400\b/.test(String((error && error.message) || error || ''));
}

// 最後の LINE のエラー（5件）を Script Properties の LAST_LINE_ERRORS に残す（管理者が GAS の画面で見られる）
function rememberLineError_(kind, error, messages) {
  try {
    const list = JSON.parse(getScriptProperty_('LAST_LINE_ERRORS') || '[]');
    list.unshift({
      at: nowJst_(),
      kind: kind,
      error: String((error && error.message) || error).slice(0, 800),
      sample: JSON.stringify(messages || []).slice(0, 400),
    });
    setScriptProperty_('LAST_LINE_ERRORS', JSON.stringify(list.slice(0, 5)));
  } catch (ignored) {
    // 残せなくても止めない
  }
}

function getGroupSummary_(groupId) {
  return callLineApi_('get', 'https://api.line.me/v2/bot/group/' + encodeURIComponent(groupId) + '/summary');
}

// 1回の呼び出しの中では、同じ人のプロフィールは1回だけ LINE に聞く（H9）
const MEMBER_PROFILE_MEMO_ = {};

function getGroupMemberProfile_(groupId, userId) {
  const key = String(groupId) + '|' + String(userId);
  if (!Object.prototype.hasOwnProperty.call(MEMBER_PROFILE_MEMO_, key)) {
    MEMBER_PROFILE_MEMO_[key] = callLineApi_(
      'get',
      'https://api.line.me/v2/bot/group/' + encodeURIComponent(groupId) + '/member/' + encodeURIComponent(userId)
    );
  }
  return MEMBER_PROFILE_MEMO_[key];
}

function callLineApi_(method, url, payload) {
  const options = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + getLineChannelAccessToken_(),
    },
    muteHttpExceptions: true,
    contentType: 'application/json',
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const text = response.getContentText();

  if (statusCode >= 200 && statusCode < 300) {
    return text ? (parseJsonSafely_(text) || {}) : {};
  }
  // 断りの返事は JSON でないこともある。番号（400 など）がわかるように、そのまま知らせる

  throw new Error('LINE API error ' + statusCode + ': ' + text);
}

function buildLineSenderByGroup_(groupId) {
  const sender = {
    name: normalizeLineSenderName_(getLineSenderName_()),
  };
  try {
    const summary = getCachedGroupSummary_(groupId);
    if (summary && summary.groupName) {
      sender.name = normalizeLineSenderName_(summary.groupName);
    }
    if (summary && summary.pictureUrl) {
      sender.iconUrl = summary.pictureUrl;
    }
  } catch (error) {
    // Fall back to default sender metadata when group summary is unavailable.
  }
  return sender;
}

// 送り主の名前は20字まで。「LINE」などの言葉は使えない（入っていると返事ごと断られる）ので、決まりの名前にする
function normalizeLineSenderName_(value) {
  const fallback = normalizeLineSenderNameByLength_(getLineSenderName_()) || 'Bot';
  const text = normalizeLineSenderNameByLength_(value);
  if (!text || !isUsableLineSenderName_(text)) {
    return isUsableLineSenderName_(fallback) ? fallback : 'Bot';
  }
  return text;
}

function isUsableLineSenderName_(name) {
  return !/line/i.test(String(name || ''));
}

function normalizeLineSenderNameByLength_(value) {
  return String(value || '').trim().slice(0, 20);
}

function attachSenderToLineMessage_(message, sender) {
  if (!message || !sender || !sender.name) {
    return message;
  }
  return Object.assign({}, message, {
    sender: sender,
  });
}

function getCachedGroupSummary_(groupId) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) {
    return null;
  }

  const cacheKey = GROUP_SUMMARY_CACHE_KEY_PREFIX_ + normalizedGroupId;
  const cacheDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const cached = getScriptProperty_(cacheKey);

  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.cacheDate === cacheDate) {
        return parsed.summary || null;
      }
    } catch (error) {
      // Ignore broken cache and refresh from LINE API.
    }
  }

  const summary = getGroupSummary_(normalizedGroupId);
  setScriptProperty_(cacheKey, JSON.stringify({
    cacheDate: cacheDate,
    summary: summary || {},
  }));
  return summary || null;
}
