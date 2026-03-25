// Open side panel when clicking the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// When a tab is activated, notify the side panel
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  const groupInfo = await getGroupInfo(tab);
  chrome.runtime.sendMessage({
    type: 'tab-changed',
    ...groupInfo
  }).catch(() => {}); // side panel may not be open
});

// When a tab's group changes, handle content migration
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.groupId !== undefined) {
    const newGroupId = changeInfo.groupId;

    if (newGroupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      // Tab moved INTO a group — migrate ungrouped content
      await migrateNoteToGroup(tabId, newGroupId);
    }

    // Notify side panel of the change
    const groupInfo = await getGroupInfo(tab);
    chrome.runtime.sendMessage({
      type: 'tab-changed',
      ...groupInfo
    }).catch(() => {});
  }
});

// Get the storage key and display info for a tab
async function getGroupInfo(tab) {
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    try {
      const group = await chrome.tabGroups.get(tab.groupId);
      return {
        storageKey: `note_group_${tab.groupId}`,
        label: group.title || `Group (${group.color})`,
        color: group.color,
        isGroup: true,
        groupId: tab.groupId,
        tabId: tab.id
      };
    } catch {
      return ungroupedInfo(tab.id);
    }
  }
  return ungroupedInfo(tab.id);
}

function ungroupedInfo(tabId) {
  return {
    storageKey: `note_tab_${tabId}`,
    label: 'Ungrouped Tab',
    color: null,
    isGroup: false,
    groupId: null,
    tabId: tabId
  };
}

// When a tab joins a group, append its ungrouped note to the group note
async function migrateNoteToGroup(tabId, groupId) {
  const tabKey = `note_tab_${tabId}`;
  const groupKey = `note_group_${groupId}`;

  const result = await chrome.storage.local.get([tabKey, groupKey]);
  const tabNote = result[tabKey];

  if (tabNote && tabNote.trim()) {
    const groupNote = result[groupKey] || '';
    const separator = groupNote.trim() ? '\n\n---\n\n' : '';
    const merged = groupNote + separator + tabNote;

    await chrome.storage.local.set({ [groupKey]: merged });
    await chrome.storage.local.remove(tabKey);
  }
}

// Respond to side panel asking for current tab info
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-current-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      if (tabs[0]) {
        const info = await getGroupInfo(tabs[0]);
        sendResponse(info);
      }
    });
    return true; // keep channel open for async response
  }
});
