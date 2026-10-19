# 531 TRAIN — GitHub Pages 업로드용

이 ZIP 파일을 **GitHub 저장소에 그대로 업로드하지 마세요.**
압축을 풀어 나온 `index.html`, `app.js`, `logic.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons` 폴더, `.nojekyll`을 **저장소 최상위**에 업로드하세요.

1. GitHub > New repository > 이름 `531-train` > Public > Create repository.
2. 저장소 Code 탭 > Add file > Upload files > 압축 해제한 파일과 `icons` 폴더 전부 업로드 > Commit changes.
3. Settings > Pages > Source: Deploy from a branch > Branch: `main` > Folder: `/(root)` > Save.
4. 최대 10분 정도 기다렸다가 `https://<사용자아이디>.github.io/531-train/` 접속.
5. Android Chrome: 앱 설치/홈 화면에 추가. iPhone Safari: 공유 > 홈 화면에 추가.

모든 자산 경로는 상대경로로 작성하여 GitHub Pages의 `/531-train/` 같은 하위 주소에 맞게 동작합니다.

## 주의
- GitHub Pages 공개 사이트의 앱 **소스코드**는 공개됩니다.
- 앱에 입력한 운동 기록은 기본적으로 해당 스마트폰/브라우저의 로컬 저장소에만 남고, GitHub 저장소에 자동 업로드되지 않습니다. 기기 변경 전 앱의 JSON 백업 메뉴를 사용하세요.
- 브라우저/PWA는 백그라운드 알림음과 진동을 보장하지 않습니다. 타이머는 돌아오면 종료시각을 기준으로 다시 표시됩니다.
- 5/3/1·3/5/1 진행주차 및 TM은 앱 설정에서 변경할 수 있습니다.
