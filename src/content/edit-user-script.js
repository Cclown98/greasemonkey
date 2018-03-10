let gUserScript = null;

// Change the title of the save icon (and more) to initial values.
rivets.bind(document, {});

var editor = CodeMirror(
    document.getElementById('editor'),
    // TODO: Make appropriate options user-configurable.
    {
      'tabSize': 2,
      'lineNumbers': true,
    });

CodeMirror.commands.save = onSave;

const userScriptUuid = location.hash.substr(1);
const editorDocs = [];
const editorTabs = [];
const editorUrls = [];
const tabs = document.getElementById('tabs');

///////////////////////////////////////////////////////////////////////////////

function addRequireTab(url, content) {
  if (!url) return console.error('addRequireTab missing URL!');
  if (!content) return console.error('addRequireTab missing content!');
  let requireTab = document.createElement('li');
  requireTab.className = 'tab';
  requireTab.textContent = nameForUrl(url);
  tabs.appendChild(requireTab);
  editorTabs.push(requireTab);
  editorDocs.push(CodeMirror.Doc(content, 'javascript'));
  editorUrls.push(url);
}

function nameForUrl(url) {
  return unescape(url.replace(/.*\//, '').replace(/[?#].*/, ''));
}

///////////////////////////////////////////////////////////////////////////////

chrome.runtime.sendMessage({
  'name': 'UserScriptGet',
  'uuid': userScriptUuid,
}, userScript => {
  gUserScript = userScript;

  let scriptTab = document.createElement('li');
  scriptTab.className = 'tab active';
  scriptTab.textContent = userScript.name;
  tabs.appendChild(scriptTab);
  editorTabs.push(scriptTab);
  editorDocs.push(CodeMirror.Doc(userScript.content, 'javascript'));
  editorUrls.push(null);

  Object.keys(userScript.requiresContent).forEach(u => {
    addRequireTab(u, userScript.requiresContent[u]);
  });

  editor.swapDoc(editorDocs[0]);
  editor.focus();

  document.title = _('NAME_greasemonkey_user_script_editor', userScript.name);
});

///////////////////////////////////////////////////////////////////////////////

// TODO: Keyboard accessibility?
tabs.addEventListener('click', event => {
  if (event.target.classList.contains('tab')) {
    let selectedTab = document.querySelector('#tabs .tab.active');
    selectedTab.classList.remove('active');

    let newTab = event.target;
    newTab.classList.add('active');

    let idx = editorTabs.indexOf(newTab);
    editor.swapDoc(editorDocs[idx]);
    editor.focus();
  }
}, true);


editor.on('change', change => {
  let selectedTab = document.querySelector('#tabs .tab.active');
  let idx = editorTabs.indexOf(selectedTab);
  let selectedDoc = editorDocs[idx];
  if (selectedDoc.isClean()) {
    selectedTab.classList.remove('dirty');
  } else {
    selectedTab.classList.add('dirty');
  }
});


async function onSave() {
  if (document.querySelectorAll('#tabs .tab.dirty').length == 0) {
    return;
  }

  // Always use a downloader to save, in case of new remotes.
  let downloader = new UserScriptDownloader()
  downloader.setScriptUrl(gUserScript.downloadUrl);
  downloader.setScriptContent(editorDocs[0].getValue());

  let requires = {};
  for (let i = 1; i < editorDocs.length; i++) {
    requires[ editorUrls[i] ] = editorDocs[i].getValue();
  }
  downloader.setKnownRequires(requires);
  downloader.setKnownResources(gUserScript.resources);
  downloader.setKnownUuid(userScriptUuid);

  await downloader.start();

  // TODO: Some sort of progress "dialog" here.

  onSaveComplete(await downloader.install());
}


function onSaveComplete(savedDetails) {
  document.title = _('NAME_greasemonkey_user_script_editor', savedDetails.name);
  tabs.children[0].textContent = savedDetails.name;

  for (let i = editorDocs.length; i--; ) {
    let url = editorUrls[i];
    if (i > 0 && !savedDetails.requiresContent[url]) {
      editorTabs[i].parentNode.removeChild(editorTabs[i]);
      editorDocs.splice(i, 1);
      editorTabs.splice(i, 1);
      editorUrls.splice(i, 1);
    } else {
      editorDocs[i].markClean();
      editorTabs[i].classList.remove('dirty');
    }
  }

  Object.keys(savedDetails.requiresContent).forEach(u => {
    if (editorUrls.indexOf(u) === -1) {
      addRequireTab(u, savedDetails.requiresContent[u]);
    }
  });
}

///////////////////////////////////////////////////////////////////////////////

editor.on('swapDoc', doc => {
  if (doc.getMode().name == 'javascript') {
    doc.setOption('gutters', ['CodeMirror-lint-markers']);
    doc.setOption('lint', true);
    doc.performLint();
  }
});

document.getElementById('save').addEventListener('click', () => {
  editor.execCommand('save');
});
