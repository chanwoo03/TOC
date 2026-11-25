// npx cap sync android 뒤에 실행: Android 빌드가 .gz 자산을 풀어서 같은 이름으로 넣기 때문에
// easy-drug.json 과 easy-drug.json.gz 가 "Duplicate resources" 오류를 낸다.
// 앱은 .gz 가 없으면 easy-drug.json 을 읽으므로, Android 쪽 사본에서 .gz 만 지운다.
// (웹용 public/data, dist 의 파일은 건드리지 않음)
import { rm } from "node:fs/promises";

const target = new URL("../android/app/src/main/assets/public/data/easy-drug.json.gz", import.meta.url);
await rm(target, { force: true });
console.log("Android 자산에서 easy-drug.json.gz 를 뺐어요 (웹 파일은 그대로).");
