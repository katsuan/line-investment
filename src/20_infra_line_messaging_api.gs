function sendReplyMessage_(replyToken, messages, groupId) {
  if (!replyToken || !messages || messages.length === 0) {
    return;
  }

  const sender = groupId ? buildLineSenderByGroup_(groupId) : null;
  callLineApi_('post', 'https://api.line.me/v2/bot/message/reply', {
    replyToken: replyToken,
    messages: messages.map(function(message) {
      return attachSenderToLineMessage_(message, sender);
    }),
  });
}

function getGroupSummary_(groupId) {
  return callLineApi_('get', 'https://api.line.me/v2/bot/group/' + encodeURIComponent(groupId) + '/summary');
}

function getGroupMemberProfile_(groupId, userId) {
  return callLineApi_(
    'get',
    'https://api.line.me/v2/bot/group/' + encodeURIComponent(groupId) + '/member/' + encodeURIComponent(userId)
  );
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
  const body = text ? JSON.parse(text) : {};

  if (statusCode >= 200 && statusCode < 300) {
    return body;
  }

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

function normalizeLineSenderName_(value) {
  const fallback = normalizeLineSenderNameByLength_(getLineSenderName_()) || 'Bot';
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  return normalizeLineSenderNameByLength_(text) || fallback;
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

  const scriptProperties = PropertiesService.getScriptProperties();
  const cacheKey = GROUP_SUMMARY_CACHE_KEY_PREFIX_ + normalizedGroupId;
  const cacheDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const cached = scriptProperties.getProperty(cacheKey);

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
  scriptProperties.setProperty(cacheKey, JSON.stringify({
    cacheDate: cacheDate,
    summary: summary || {},
  }));
  return summary || null;
}
