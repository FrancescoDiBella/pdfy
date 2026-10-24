# Published app smoke check

Merged application commit: `cfd77f9cfb56663b431d8ba42f51db73184f0211`.

[Main CI and Pages deployment](https://github.com/FrancescoDiBella/pdfy/actions/runs/40080663233) both succeeded. The merged tree exactly matches the reviewed/tested PR head.

Direct browser check at https://francescodibella.github.io/pdfy/ confirmed the installed-app update flow from the previous cached version to deployed bundle `index-C4wDF5V6.js`. The new viewport metadata was present, the Sample Invoice rendered, and Tools opened and closed successfully.

`pdfy-live-editor-1792833114114.jpg` is the unedited live browser screenshot at 1363×936 after closing Tools. It supplements the 19 CI screenshots and is a desktop production smoke check, not evidence of physical mobile Safari/PWA behavior. Those manual checks remain under #5.
