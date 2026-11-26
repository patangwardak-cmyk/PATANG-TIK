let patangCameraStream=null;
let patangRecorder=null;
let patangChunks=[];
let patangFacing="environment";
let patangCameraTimer=null;
let patangRecordStarted=0;

function openPublish(){
 if(confirm("د نوې ویډیو د ثبت لپاره OK کېکاږه.\nد پخوانۍ ویډیو انتخاب لپاره Cancel کېکاږه.")){
  document.getElementById("cameraModal").style.display="flex";
 }else{
  document.getElementById("videoFile").click();
 }
}

async function startCamera(){
 const status=document.getElementById("cameraStatus");
 try{
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
   throw new Error("دا براوزر د کامرې ملاتړ نه کوي");
  }
  if(patangCameraStream){
   patangCameraStream.getTracks().forEach(track=>track.stop());
   patangCameraStream=null;
  }
  const quality=Number(document.getElementById("cameraQuality").value);
  const constraints={
   video:{
    facingMode:{ideal:patangFacing},
    width:{ideal:quality===1080?1920:1280},
    height:{ideal:quality===1080?1080:720}
   },
   audio:true
  };
  status.textContent=patangLanguages[document.documentElement.lang]?.cameraStarting||"کامره چمتو کېږي...";
  patangCameraStream=await navigator.mediaDevices.getUserMedia(constraints);
  const preview=document.getElementById("cameraPreview");
  preview.srcObject=patangCameraStream;
  await preview.play();
  document.getElementById("cameraPlaceholder").style.display="none";
  document.getElementById("cameraRecordButton").disabled=false;
  document.getElementById("cameraRecordButton").style.opacity="1";
  document.getElementById("cameraStartButton").textContent=patangLanguages[document.documentElement.lang]?.cameraStart||"🔄 کامره بیا پیل";
  status.textContent=patangLanguages[document.documentElement.lang]?.cameraActive||"کامره چمتو ده";
 }catch(error){
  status.textContent=patangLanguages[document.documentElement.lang]?.cameraFailed||"کامره فعاله نه شوه";
  alert("کامره فعاله نه شوه: "+(error.message||"د کامرې اجازه ورکړه او بیا هڅه وکړه."));
 }
}

async function switchCamera(){
 patangFacing=patangFacing==="environment"?"user":"environment";
 if(patangCameraStream) await startCamera();
}

function toggleRecording(){
 if(patangRecorder && patangRecorder.state==="recording"){
  patangRecorder.stop();
  return;
 }
 if(!patangCameraStream){
  alert("لومړی کامره پیل کړه");
  return;
 }
 try{
  patangChunks=[];
  const types=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
  const mime=types.find(type=>MediaRecorder.isTypeSupported(type));
  patangRecorder=new MediaRecorder(patangCameraStream,mime?{mimeType:mime}:{});
  patangRecorder.ondataavailable=event=>{
   if(event.data && event.data.size>0) patangChunks.push(event.data);
  };
  patangRecorder.onstop=uploadCameraRecording;
  patangRecorder.start(1000);
  patangRecordStarted=Date.now();
  const button=document.getElementById("cameraRecordButton");
  button.textContent="■";
  button.style.background="#777";
  document.getElementById("cameraTimer").style.display="block";
  document.getElementById("cameraStatus").textContent="ثبت روان دی";
  if(patangCameraTimer) clearInterval(patangCameraTimer);
  patangCameraTimer=setInterval(()=>{
   const seconds=Math.floor((Date.now()-patangRecordStarted)/1000);
   const mm=String(Math.floor(seconds/60)).padStart(2,"0");
   const ss=String(seconds%60).padStart(2,"0");
   document.getElementById("cameraTimer").textContent="● "+mm+":"+ss;
  },500);
 }catch(error){
  alert("د ویډیو ثبت پیل نه شو: "+error.message);
 }
}

async function uploadCameraRecording(){
 if(patangCameraTimer){clearInterval(patangCameraTimer);patangCameraTimer=null;}
 const button=document.getElementById("cameraRecordButton");
 button.textContent="●";
 button.style.background="#e63946";
 document.getElementById("cameraTimer").style.display="none";
 const blob=new Blob(patangChunks,{type:patangRecorder?.mimeType||"video/webm"});
 patangChunks=[];
 if(!blob.size){alert(langText("uploadEmpty"));return;}
 const token=localStorage.getItem("patangToken");
 if(!token){alert(langText("loginBeforeUpload"));openAuth();return;}
 const caption=prompt(langText("publishCaption"))||"";
 const data=new FormData();
 data.append("video",blob,"patang-"+Date.now()+".webm");
 data.append("caption",caption);
 try{
  button.disabled=true;
  showUploadProgress(0);
  await uploadWithProgress(data,token,showUploadProgress);
  showUploadProgress(100);
  alert(langText("uploadSuccess"));
  hideUploadProgress();
  closeCamera();
  await loadVideos();
 }catch(error){
  hideUploadProgress();
  alert(langText("uploadFailed")+" "+error.message);
  document.getElementById("cameraStatus").textContent=langText("uploadFailed");
 }finally{
  button.disabled=false;
 }
}

function closeCamera(){
 if(patangRecorder && patangRecorder.state==="recording"){
  patangRecorder.onstop=null;
  patangRecorder.stop();
 }
 if(patangCameraTimer){clearInterval(patangCameraTimer);patangCameraTimer=null;}
 if(patangCameraStream){
  patangCameraStream.getTracks().forEach(track=>track.stop());
  patangCameraStream=null;
 }
 const preview=document.getElementById("cameraPreview");
 if(preview) preview.srcObject=null;
 document.getElementById("cameraModal").style.display="none";
 document.getElementById("cameraRecordButton").disabled=true;
 document.getElementById("cameraRecordButton").style.opacity=".45";
 document.getElementById("cameraPlaceholder").style.display="flex";
 document.getElementById("cameraStatus").textContent=patangLanguages[document.documentElement.lang]?.cameraReady||"چمتو";
 document.getElementById("cameraStartButton").textContent=patangLanguages[document.documentElement.lang]?.cameraStart||"📷 پیل کامره";
 document.getElementById("cameraTimer").style.display="none";
}


const patangLanguages={
 ps:{dir:"rtl",notificationsTitle:"🔔 خبرتیاوې",notificationsLoading:"خبرتیاوې...",messagesTitle:"💬 شخصي پیغامونه",usersLoading:"کارنان لوډ کېږي...",chooseUser:"د خبرو لپاره یو کارن وټاکئ",privateMessagePlaceholder:"خپل پیغام ولیکئ...",usersFailed:"کارنان ونه لوډ شول. بیا هڅه وکړه.",noOtherUsers:"تر اوسه بل کارن نشته",messagesLoading:"پیغامونه لوډ کېږي...",messagesFailed:"پیغامونه ونه لوډ شول.",noMessages:"لا تر اوسه پیغام نشته. لومړی پیغام ولېږه.",chooseUserAlert:"لومړی یو کارن وټاکه",sendFailed:"پیغام ونه لېږل شو",serverConnectionFailed:"د سرور سره اړیکه نشته",noNotifications:"تر اوسه خبرتیا نشته",user:"کارن",newNotification:"نوې خبرتیا",notificationsFailed:"خبرتیاوې نه ښکاري؛ د سرور اړیکه وګوره.",loginForNotifications:"د خبرتیاوو لیدلو لپاره لومړی حساب ته ننوځه",commentsTitle:"💬 تبصرې",commentPlaceholder:"خپل نظر ولیکئ...",send:"لېږل",authTitle:"حساب جوړول او ننوتل",usernamePlaceholder:"د کارونکي نوم",passwordPlaceholder:"پاسورډ (لږ تر لږه ۸ توري)",register:"حساب جوړول",login:"ننوتل",myProfile:"👤 زما پروفایل",myVideos:"زما ویډیوګانې 🎬",otherUsers:"نور کارنان 👥",logout:"وتل",close:"بندول ✖",searchTitle:"🔎 لټون – PATANG TIK",searchPlaceholder:"د ویډیو یا کارونکي نوم ولیکئ...",searchPrompt:"د لټون لپاره نوم ولیکئ...",home:"کور",search:"لټون",publish:"خپرول",messages:"پیغامونه",notifications:"خبرتیاوې",profile:"پروفایل",cameraStart:"📷 پیل کامره",cameraSwitch:"🔄 کامره اړول",cameraClose:"بندول",cameraHint:"د کامرې د پیل لپاره د کامرې تڼۍ کېکاږه",cameraReady:"چمتو",cameraStarting:"کامره چمتو کېږي...",cameraActive:"کامره چمتو ده",cameraFailed:"کامره فعاله نه شوه",publishCaption:'د ویډیو تشریح او هشتګونه ولیکئ:',loginBeforeUpload:'لومړی خپل حساب ته ننوځه',uploading:'ویډیو خپرېږي...',uploadSuccess:'ویډیو په بریالیتوب خپره شوه! 🇦🇫',uploadFailed:'ویډیو خپره نه شوه:',uploadEmpty:'ویډیو ثبت نه شوه؛ بیا هڅه وکړه.',uploadButton:'ویډیو پورته کېږي...',uploadFileFailed:'د ویډیو پورته کول ناکام شول',uploadCameraFailed:'د ویډیو ثبت پیل نه شو:'},
 fa:{dir:"rtl",notificationsTitle:"🔔 اعلان‌ها",notificationsLoading:"اعلان‌ها...",messagesTitle:"💬 پیام‌های خصوصی",usersLoading:"کاربران در حال بارگذاری...",chooseUser:"برای گفتگو یک کاربر انتخاب کنید",privateMessagePlaceholder:"پیام خود را بنویسید...",usersFailed:"کاربران بارگذاری نشدند. دوباره تلاش کنید.",noOtherUsers:"هنوز کاربر دیگری وجود ندارد",messagesLoading:"پیام‌ها در حال بارگذاری...",messagesFailed:"پیام‌ها بارگذاری نشدند.",noMessages:"هنوز پیامی نیست. نخستین پیام را بفرستید.",chooseUserAlert:"نخست یک کاربر انتخاب کنید",sendFailed:"پیام ارسال نشد",serverConnectionFailed:"ارتباط با سرور برقرار نشد",noNotifications:"هنوز اعلانی وجود ندارد",user:"کاربر",newNotification:"اعلان جدید",notificationsFailed:"اعلان‌ها نمایش داده نمی‌شوند؛ ارتباط سرور را بررسی کنید.",loginForNotifications:"برای دیدن اعلان‌ها نخست وارد حساب شوید",commentsTitle:"💬 دیدگاه‌ها",commentPlaceholder:"نظر خود را بنویسید...",send:"ارسال",authTitle:"ساخت حساب و ورود",usernamePlaceholder:"نام کاربری",passwordPlaceholder:"رمز عبور (حداقل ۸ حرف)",register:"ساخت حساب",login:"ورود",myProfile:"👤 پروفایل من",myVideos:"ویدیوهای من 🎬",otherUsers:"کاربران دیگر 👥",logout:"خروج",close:"بستن ✖",searchTitle:"🔎 جستجو – PATANG TIK",searchPlaceholder:"نام ویدیو یا کاربر را بنویسید...",searchPrompt:"برای جستجو نامی بنویسید...",home:"خانه",search:"جستجو",publish:"انتشار",messages:"پیام‌ها",notifications:"اعلان‌ها",profile:"پروفایل",cameraStart:"📷 شروع دوربین",cameraSwitch:"🔄 تغییر دوربین",cameraClose:"بستن",cameraHint:"برای شروع، دکمه دوربین را بزنید",cameraReady:"آماده",cameraStarting:"دوربین آماده می‌شود...",cameraActive:"دوربین آماده است",cameraFailed:"دوربین فعال نشد",publishCaption:'توضیحات و هشتگ\u200cهای ویدیو را بنویسید:',loginBeforeUpload:'نخست وارد حساب شوید',uploading:'ویدیو در حال انتشار است...',uploadSuccess:'ویدیو با موفقیت منتشر شد! 🇦🇫',uploadFailed:'ویدیو منتشر نشد:',uploadEmpty:'ویدیو ثبت نشد؛ دوباره تلاش کنید.',uploadButton:'ویدیو در حال بارگذاری...',uploadFileFailed:'بارگذاری ویدیو ناموفق بود',uploadCameraFailed:'ثبت ویدیو آغاز نشد:'},
 en:{dir:"ltr",notificationsTitle:"🔔 Notifications",notificationsLoading:"Loading notifications...",messagesTitle:"💬 Private messages",usersLoading:"Loading users...",chooseUser:"Choose a user to chat with",privateMessagePlaceholder:"Write your message...",usersFailed:"Could not load users. Try again.",noOtherUsers:"There are no other users yet",messagesLoading:"Loading messages...",messagesFailed:"Could not load messages.",noMessages:"No messages yet. Send the first message.",chooseUserAlert:"Choose a user first",sendFailed:"Message could not be sent",serverConnectionFailed:"Could not connect to the server",noNotifications:"No notifications yet",user:"User",newNotification:"New notification",notificationsFailed:"Notifications could not be displayed; check the server connection.",loginForNotifications:"Log in first to view notifications",commentsTitle:"💬 Comments",commentPlaceholder:"Write a comment...",send:"Send",authTitle:"Create account and log in",usernamePlaceholder:"Username",passwordPlaceholder:"Password (at least 8 characters)",register:"Create account",login:"Log in",myProfile:"👤 My profile",myVideos:"My videos 🎬",otherUsers:"Other users 👥",logout:"Log out",close:"Close ✖",searchTitle:"🔎 Search – PATANG TIK",searchPlaceholder:"Enter a video or username...",searchPrompt:"Enter a name to search...",home:"Home",search:"Search",publish:"Post",messages:"Messages",notifications:"Alerts",profile:"Profile",cameraStart:"📷 Start camera",cameraSwitch:"🔄 Switch camera",cameraClose:"Close",cameraHint:"Tap Start Camera to begin",cameraReady:"Ready",cameraStarting:"Starting camera...",cameraActive:"Camera is ready",cameraFailed:"Camera unavailable",publishCaption:'Enter a video caption and hashtags:',loginBeforeUpload:'Please log in first',uploading:'Publishing video...',uploadSuccess:'Video published successfully! 🇦🇫',uploadFailed:'Video could not be published:',uploadEmpty:'Video was not recorded. Please try again.',uploadButton:'Uploading video...',uploadFileFailed:'Video upload failed',uploadCameraFailed:'Could not start video recording:'}
};

function langText(key){
 const lang=document.documentElement.lang||"ps";
 return patangLanguages[lang]?.[key]||patangLanguages.ps[key]||key;
}

function setLanguage(language){
 const lang=patangLanguages[language]?language:"ps";
 const t=patangLanguages[lang];
 document.documentElement.lang=lang;
 document.documentElement.dir=t.dir;
 const labels={navHome:t.home,navSearch:t.search,navPublish:t.publish,navMessages:t.messages,navNotifications:t.notifications,navProfile:t.profile};
 Object.entries(labels).forEach(([id,value])=>{
  const el=document.getElementById(id);
  if(el) el.textContent=value;
 });
 document.querySelectorAll("[data-i18n]").forEach(el=>{
  const key=el.dataset.i18n;
  if(t[key]) el.textContent=t[key];
 });
 document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
  const key=el.dataset.i18nPlaceholder;
  if(t[key]) el.placeholder=t[key];
 });
 const hint=document.getElementById("cameraPlaceholder");
 if(hint) hint.textContent=t.cameraHint;
 const status=document.getElementById("cameraStatus");
 if(status && ["چمتو","Ready","آماده"].includes(status.textContent)) status.textContent=t.cameraReady;
 try{localStorage.setItem("patangLanguage",lang)}catch(e){}
 const selector=document.getElementById("languageSelect");
 if(selector && selector.value!==lang) selector.value=lang;
}

function loadSavedLanguage(){
 let saved="ps";
 try{saved=localStorage.getItem("patangLanguage")||"ps"}catch(e){}
 setLanguage(saved);
}

loadSavedLanguage();
let patangSearchSequence=0;

function goHome(){
 ["searchModal","authBox","messagesModal","notificationsModal","commentsModal"].forEach(id=>{
  const box=document.getElementById(id);
  if(box) box.style.display="none";
 });
 const videoBox=document.getElementById("videoBox");
 if(videoBox) videoBox.scrollTo({top:0,behavior:"smooth"});
 loadVideos();
}

function openSearch(){
 const modal=document.getElementById("searchModal");
 modal.style.display="flex";
 const input=document.getElementById("patangSearchInput");
 input.value="";
 document.getElementById("searchResults").innerHTML="<p>د ویډیو یا کارونکي نوم ولیکئ...</p>";
 setTimeout(()=>input.focus(),100);
 runPatangSearch();
}

async function openUserProfile(username){
 const modal=document.getElementById("userProfileModal");
 const content=document.getElementById("userProfileContent");
 modal.style.display="block";
 content.innerHTML="پروفایل لوډ کېږي...";
 try{
  const token=localStorage.getItem("patangToken");
  const r=await fetch("/api/users/"+encodeURIComponent(username)+"/profile",{
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.message||"پروفایل ترلاسه نه شو");
  const avatar=data.avatar
   ? `<img src="${escapeHTML(data.avatar)}" style="width:105px;height:105px;border-radius:50%;object-fit:cover;border:3px solid #20c56b">`
   : `<div style="font-size:65px">👤</div>`;
  const videos=Array.isArray(data.videos)?data.videos:[];
  const followButton=data.isMe ? "" : data.isFollowing
   ? `<button onclick="changeUserFollow('${escapeHTML(data.username)}','unfollow')" style="background:#444;color:white;padding:11px 24px;border-radius:12px;margin:10px">تعقیب پرېږده</button>`
   : data.requestSent
   ? `<button disabled style="background:#555;color:white;padding:11px 24px;border-radius:12px;margin:10px">غوښتنه لېږل شوې ✓</button>`
   : `<button onclick="changeUserFollow('${escapeHTML(data.username)}','follow')" style="background:#168b45;color:white;padding:11px 24px;border-radius:12px;margin:10px">＋ فالو</button>`;
  content.innerHTML=`
   ${avatar}
   <h2 style="color:#20c56b">${escapeHTML(data.username)}</h2>
   ${followButton}
   <p>👥 پلویان: ${Number(data.followers)||0} · تعقیبوي: ${Number(data.following)||0}</p>
   <h3>🎬 د دې کارن ویډیوګانې (${videos.length})</h3>
   <div style="text-align:right">
    ${videos.map(v=>`
     <div style="background:#15191a;padding:10px;margin:10px 0;border-radius:13px">
      <video src="${escapeHTML(v.url)}" controls playsinline style="width:100%;max-height:360px;background:#000;border-radius:10px"></video>
      <p>${escapeHTML(v.caption||"د PATANG TIK ویډیو")}</p>
      <small>❤️ ${Number(v.likes)||0} · 👁️ ${Number(v.views)||0}</small>
     </div>
    `).join("") || "<p>دا کارن تر اوسه ویډیو نه لري.</p>"}
   </div>`;
 }catch(e){
  content.innerText=e.message||"پروفایل ترلاسه نه شو";
 }
}
async function changeUserFollow(username,action){
 try{
  const token=localStorage.getItem("patangToken");
  const r=await fetch("/api/"+action+"/"+encodeURIComponent(username),{
   method:"POST",
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.message||"عملیات ناکام شو");
  alert(data.message||"عملیات بریالی شو");
  await openUserProfile(username);
 }catch(e){
  alert(e.message||"د فالو عملیات ترسره نه شو");
 }
}

function closeUserProfile(){
 document.getElementById("userProfileModal").style.display="none";
}

function closeSearch(){
 document.getElementById("searchModal").style.display="none";
}

async function runPatangSearch(){
 const input=document.getElementById("patangSearchInput");
 const box=document.getElementById("searchResults");
 const q=input.value.trim().toLocaleLowerCase();
 const sequence=++patangSearchSequence;
 box.innerHTML="<p>لټون روان دی...</p>";

 try{
  const videoResponse=await fetch("/api/videos");
  if(!videoResponse.ok) throw new Error("ویډیوګانې ترلاسه نه شوې");
  const videos=await videoResponse.json();
  let users=[];
  const token=localStorage.getItem("patangToken");

  if(token){
   try{
    const userResponse=await fetch("/api/users",{
     headers:{Authorization:"Bearer "+token}
    });
    if(userResponse.ok) users=await userResponse.json();
   }catch(e){}
  }

  if(sequence!==patangSearchSequence) return;

  const matchingVideos=videos.filter(v=>
   [v.caption,v.owner,v.name].some(value=>
    String(value||"").toLocaleLowerCase().includes(q)
   )
  ).slice(0,20);

  const matchingUsers=users.filter(u=>
   String(u.username||"").toLocaleLowerCase().includes(q)
  ).slice(0,20);

  let output='<h3 class="search-section-title">🎬 ویډیوګانې</h3>';

  output+=matchingVideos.length ? matchingVideos.map(v=>`
   <button class="search-result" data-search-video="${escapeHTML(v.name)}">
    🎬 <b>${escapeHTML(v.caption||"بې تشریح ویډیو")}</b>
    <p>👤 ${escapeHTML(v.owner||"PATANG")} · ❤️ ${Number(v.likes)||0}</p>
   </button>
  `).join("") : "<p>ویډیو ونه موندل شوه</p>";

  output+='<h3 class="search-section-title">👥 کارنان</h3>';

  if(!token){
   output+="<p>د کارنانو د لټون لپاره لومړی خپل حساب ته ننوځه.</p>";
  }else{
   output+=matchingUsers.length ? matchingUsers.map(u=>`
    <button class="search-result" data-search-user="${escapeHTML(u.username)}">
     👤 <b>${escapeHTML(u.username)}</b>
     <p>پلویان: ${Number(u.followers)||0} · تعقیبوي: ${Number(u.following)||0}</p>
    </button>
   `).join("") : "<p>کارن ونه موندل شو</p>";
  }

  box.innerHTML=output;

  box.querySelectorAll("[data-search-video]").forEach(button=>{
   button.addEventListener("click",()=>{
    const name=button.getAttribute("data-search-video");
    closeSearch();
    const target=[...document.querySelectorAll("#videoBox video")].find(v=>
     v.getAttribute("src")==="/videos/"+name
    );
    if(target){
     target.parentElement.scrollIntoView({behavior:"smooth",block:"start"});
     target.play().catch(()=>{});
    }else{
     alert("دا ویډیو په اوسني لیست کې نشته؛ کور پاڼه تازه کړه.");
    }
   });
  });

  box.querySelectorAll("[data-search-user]").forEach(button=>{
   button.addEventListener("click",()=>{
    const username=button.getAttribute("data-search-user");
    closeSearch();
    openUserProfile(username);
   });
  });

 }catch(e){
  if(sequence===patangSearchSequence){
   box.innerHTML="<p>لټون ناکام شو؛ د سرور اړیکه وګوره.</p>";
  }
 }
}

function openAuth(){
 document.getElementById("authBox").style.display="flex";
 checkMe();
}
function closeAuth(){
 document.getElementById("authBox").style.display="none";
}
async function registerUser(){
 const username=document.getElementById("authName").value.trim();
 const password=document.getElementById("authPass").value;
 const status=document.getElementById("authStatus");
 try{
  const r=await fetch("/api/register",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({username,password})
  });
  const d=await r.json();
  status.innerText=d.message;
 }catch(e){status.innerText="سرور ته اړیکه نشته";}
}
async function loginUser(){
 const username=document.getElementById("authName").value.trim();
 const password=document.getElementById("authPass").value;
 const status=document.getElementById("authStatus");
 try{
  const r=await fetch("/api/login",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({username,password})
  });
  const d=await r.json();
  if(!r.ok){status.innerText=d.message;return;}
  localStorage.setItem("patangToken",d.token);
  currentUsername=d.username;
  status.innerText="ښه راغلې، "+d.username+" 🇦🇫";
  showProfile(d.username);
  loadMyVideos();
  startFollowNotifications();
  startMessageNotifications();
  startNotificationUpdates();
 }catch(e){status.innerText="سرور ته اړیکه نشته";}
}

async function adminDeleteVideo(encodedName){
 if(!confirm("ایا ډاډه یې چې دا ویډیو حذف کړې؟")) return;
 const token=localStorage.getItem("patangToken");
 try{
  const r=await fetch("/api/videos/"+encodedName,{
   method:"DELETE",
   headers:{Authorization:"Bearer "+token}
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d.message || "حذف ناکام شو");
  alert("ویډیو حذف شوه ✅");
  loadAdminPanel();
 }catch(e){
  alert(e.message);
 }
}

async function adminDeleteUser(encodedName){
 const username=decodeURIComponent(encodedName);
 if(!confirm("ایا د "+username+" حساب حذف کړې؟\n\nحساب، اړیکې، پیغامونه، خبرتیاوې او د هغه تبصرې او ځوابونه به حذف شي.\nویډیوګانې او راپورونه به پاتې وي.\nدا عمل بېرته نه راګرځي.")) return;
 const token=localStorage.getItem("patangToken");
 try{
  const r=await fetch("/api/admin/users/"+encodeURIComponent(username),{
   method:"DELETE",
   headers:{Authorization:"Bearer "+token}
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d.message||"حذف ناکام شو");
  alert(d.message+" ✅");
  loadAdminPanel();
 }catch(e){
  alert(e.message);
 }
}

async function adminShowUserDetails(encodedName){
 const username=decodeURIComponent(encodedName);
 const token=localStorage.getItem("patangToken");
 try{
  const r=await fetch("/api/admin/overview",{
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.message||"معلومات ترلاسه نه شول");
  const user=(data.users||[]).find(u=>u.username===username);
  if(!user) throw new Error("کارن ونه موندل شو");
  const videos=(data.videos||[]).filter(v=>v.owner===username);
  const titles=videos.map((v,i)=>(i+1)+". "+(v.caption||"بې سرلیک ویډیو")).join("\n");
  alert("👤 د کارن معلومات\nنوم: "+user.username+
   "\nحالت: "+(user.role==="admin"?"اډمین":user.blocked?"بند":"فعال")+
   "\nټولې ویډیوګانې: "+videos.length+
   (titles?"\n\nد ویډیوګانو نومونه:\n"+titles:"\nتر اوسه ویډیو نه لري"));
 }catch(e){
  alert(e.message);
 }
}

function sortAdminVideos(){
 const list=document.getElementById("adminVideoList");
 const select=document.getElementById("adminVideoSort");
 if(!list || !select) return;

 const cards=Array.from(list.querySelectorAll("[data-admin-video]"));
 const mode=select.value;

 cards.sort((a,b)=>{
  if(mode==="likes") return Number(b.dataset.likes||0)-Number(a.dataset.likes||0);
  if(mode==="views") return Number(b.dataset.views||0)-Number(a.dataset.views||0);
  if(mode==="date") return String(b.dataset.date||"").localeCompare(String(a.dataset.date||""));
  return 0;
 });

 cards.forEach(card=>list.appendChild(card));
 filterAdminVideos();
}

function filterAdminVideos(){
 const input=document.getElementById("adminVideoSearch");
 const list=document.getElementById("adminVideoList");
 const count=document.getElementById("adminVideoSearchCount");
 if(!input || !list) return;

 const query=input.value.trim().toLowerCase();
 const cards=list.querySelectorAll("[data-admin-video]");
 let visible=0;

 cards.forEach(card=>{
  const text=card.dataset.adminVideo || "";
  const match=text.includes(query);
  card.style.display=match?"":"none";
  if(match) visible++;
 });

 if(count){
  count.innerText=visible
   ? "ښکاره ویډیوګانې: "+visible
   : "پایله ونه موندل شوه";
 }
}

async function adminShowVideoDetails(encodedName){
 const videoName=decodeURIComponent(encodedName);
 const token=localStorage.getItem("patangToken");
 try{
  const r=await fetch("/api/admin/overview",{
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.message||"معلومات ترلاسه نه شول");
  const video=(data.videos||[]).find(v=>v.name===videoName);
  if(!video) throw new Error("ویډیو ونه موندل شوه");

  alert("🎬 د ویډیو بشپړ معلومات"+
   "\\nسرلیک: "+(video.caption||"بې سرلیک")+
   "\\nخاوند: "+(video.owner||"نامعلوم")+
   "\\n❤️ لایکونه: "+(Number(video.likes)||0)+
   "\\n👁️ لیدنې: "+(Number(video.views)||0)+
   "\\n📅 نېټه: "+(video.date?new Date(video.date).toLocaleString():"نامعلوم"));
 }catch(e){
  alert(e.message);
 }
}


async function adminResetUserPassword(encodedName){
 const username=decodeURIComponent(encodedName);
 const password=prompt("د "+username+" لپاره نوی رمز ولیکه (لږ تر لږه ۸ توري):");
 if(password===null)return;
 if(password.length<8){
  alert("رمز باید لږ تر لږه ۸ توري ولري");
  return;
 }
 const confirmation=prompt("نوی رمز یو ځل بیا ولیکه:");
 if(confirmation===null)return;
 if(password!==confirmation){
  alert("دواړه رمزونه یو شان نه دي");
  return;
 }
 if(!confirm("ایا د "+username+" رمز بدل کړې؟"))return;
 const token=localStorage.getItem("patangToken");
 try{
  const r=await fetch("/api/admin/users/"+encodeURIComponent(username)+"/password",{
   method:"PATCH",
   headers:{
    Authorization:"Bearer "+token,
    "Content-Type":"application/json"
   },
   body:JSON.stringify({newPassword:password})
  });
  const d=await r.json();
  if(!r.ok)throw new Error(d.message||"د رمز بدلول ناکام شول");
  alert(d.message+" ✅");
  loadAdminPanel();
 }catch(e){
  alert(e.message);
 }
}

async function adminSetUserStatus(encodedName, blocked){
 const username=decodeURIComponent(encodedName);
 const action=blocked?"بند":"فعال";
 if(!confirm("ایا د "+username+" حساب "+action+" کړې؟")) return;
 const token=localStorage.getItem("patangToken");
 try{
  const r=await fetch("/api/admin/users/"+encodeURIComponent(username)+"/status",{
   method:"PATCH",
   headers:{
    Authorization:"Bearer "+token,
    "Content-Type":"application/json"
   },
   body:JSON.stringify({blocked})
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d.message||"عملیات ناکام شو");
  alert(d.message+" ✅");
  loadAdminPanel();
 }catch(e){
  alert(e.message);
 }
}

async function loadAdminPanel(){
 const box=document.getElementById("adminPanel");
 const token=localStorage.getItem("patangToken");
 if(!box || !token) return;
 box.style.display="block";
 box.innerHTML="<p>د اډمین معلومات بار کېږي...</p>";
 try{
  const r=await fetch("/api/admin/overview",{
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.message || "اجازه نشته");

  box.innerHTML=`
   <div style="background:#191b20;padding:15px;border:1px solid #30343b;border-radius:18px;margin-bottom:15px">
    <h3 style="color:#20c56b;text-align:center">🛡️ د PATANG TIK اډمین ډشبورډ 🇦🇫</h3>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
     <div style="background:#292d33;padding:15px;border-radius:13px;text-align:center;border-bottom:3px solid #20c56b">
      <div style="font-size:25px">👥</div><small>ټول کارنان</small>
      <div style="font-size:25px;font-weight:bold">${Number(data.userCount)||0}</div>
     </div>
     <div style="background:#292d33;padding:15px;border-radius:13px;text-align:center;border-bottom:3px solid #20c56b">
      <div style="font-size:25px">🟢</div><small>فعال حسابونه</small>
      <div style="font-size:25px;font-weight:bold">${Number(data.activeUserCount)||0}</div>
     </div>
     <div style="background:#292d33;padding:15px;border-radius:13px;text-align:center;border-bottom:3px solid #c62828">
      <div style="font-size:25px">🔒</div><small>بند حسابونه</small>
      <div style="font-size:25px;font-weight:bold">${Number(data.blockedUserCount)||0}</div>
     </div>
     <div style="background:#292d33;padding:15px;border-radius:13px;text-align:center;border-bottom:3px solid #1769aa">
      <div style="font-size:25px">🎬</div><small>ټولې ویډیوګانې</small>
      <div style="font-size:25px;font-weight:bold">${Number(data.videoCount)||0}</div>
     </div>
     <div style="background:#292d33;padding:15px;border-radius:13px;text-align:center;border-bottom:3px solid #e91e63;grid-column:1/-1">
      <div style="font-size:25px">❤️</div><small>ټول لایکونه</small>
      <div style="font-size:25px;font-weight:bold">${Number(data.totalLikes)||0}</div>
     </div>
     <div style="background:#292d33;padding:15px;border-radius:13px;text-align:center;border-bottom:3px solid #8e44ad;grid-column:1/-1">
      <div style="font-size:25px">👁️</div><small>د ټولو ویډیوګانو لیدنې</small>
      <div style="font-size:25px;font-weight:bold">${Number(data.totalViews)||0}</div>
     </div>
    </div>
   </div>
   <h3>👥 د کارنانو لېست</h3>
   ${(data.users||[]).map(u=>`<div style="background:#292d33;padding:10px;border-radius:9px;margin:7px 0">
    <b>${escapeHTML(u.username)}</b>
    <button onclick="adminShowUserDetails('${encodeURIComponent(u.username)}')" style="background:#1769aa;padding:8px 12px;border-radius:8px;margin:8px 5px">👁️ معلومات وګوره</button>
    <small style="display:block;color:#20c56b">${u.role==="admin"?"🛡️ اډمین":(u.blocked?"🔒 بند حساب":"عادي کارن")}</small>
    ${u.role!=="admin"?`<button onclick="adminResetUserPassword('${encodeURIComponent(u.username)}')" style="background:#1769aa;padding:8px 12px;border-radius:8px;margin:8px 5px">🔑 رمز بدل کړه</button><button onclick="adminSetUserStatus('${encodeURIComponent(u.username)}',${!u.blocked})" style="background:${u.blocked?"#16834a":"#c62828"};padding:8px 12px;border-radius:8px;margin-top:8px">${u.blocked?"🔓 حساب فعال کړه":"🔒 حساب بند کړه"}</button><button onclick="adminDeleteUser('${encodeURIComponent(u.username)}')" style="background:#a31515;padding:8px 12px;border-radius:8px;margin:8px 5px">🗑️ کارن حذف کړه</button>`:""}
   </div>`).join("")}
   <h3 style="margin-top:18px">🚩 د کارنانو راپورونه</h3>
   <button onclick="loadAdminReports()" style="background:#1769aa;padding:10px;border-radius:9px;width:100%;margin:8px 0">🔄 راپورونه تازه کړه</button>
   <div id="adminReportsList"><p>راپورونه بار کېږي...</p></div>
   <h3 style="margin-top:18px">🎬 د ویډیوګانو لېست</h3>
   <input id="adminVideoSearch" type="text" oninput="filterAdminVideos()" placeholder="🔍 د سرلیک یا خاوند نوم ولټوه..." style="width:100%;padding:12px;border-radius:10px;background:#292d33;color:white;border:1px solid #444;margin:8px 0">
   <select id="adminVideoSort" onchange="sortAdminVideos()" style="width:100%;padding:12px;border-radius:10px;background:#292d33;color:white;border:1px solid #444;margin:8px 0">
    <option value="date">🆕 نوې ویډیوګانې</option>
    <option value="likes">❤️ ډېر لایکونه</option>
    <option value="views">👁️ ډېرې لیدنې</option>
   </select>
   <small id="adminVideoSearchCount" style="display:block;margin:8px 0;color:#35b875">ټولې ویډیوګانې: ${(data.videos||[]).length}</small>
   <div id="adminVideoList">
   ${(data.videos||[]).map(v=>`<div data-admin-video="${escapeHTML((v.caption||"")+" "+(v.owner||"")).toLowerCase()}" data-likes="${Number(v.likes)||0}" data-views="${Number(v.views)||0}" data-date="${escapeHTML(v.date||"")}" style="background:#292d33;padding:10px;border-radius:9px;margin:7px 0">
    <b>${escapeHTML(v.caption||"بې سرلیک ویډیو")}</b>
    <small style="display:block">خاوند: ${escapeHTML(v.owner||"نامعلوم")}</small>
    <small style="display:block">❤️ لایکونه: ${Number(v.likes)||0}</small>
    <small style="display:block">👁️ لیدنې: ${Number(v.views)||0}</small>
    <button onclick="adminShowVideoDetails('${encodeURIComponent(v.name)}')" style="background:#1769aa;padding:8px 14px;border-radius:8px;margin-top:8px">📋 بشپړ معلومات</button>
    <button onclick="adminDeleteVideo('${encodeURIComponent(v.name)}')" style="background:#c62828;padding:8px 14px;border-radius:8px;margin-top:8px">🗑️ حذف ویډیو</button>
   </div>`).join("")}
   </div>
   <h3 style="margin-top:18px">📊 د اډمین د فعالیتونو احصائیه</h3>
   <div id="adminActivityChart" style="background:#20242a;padding:14px;border-radius:12px;margin:10px 0"></div>
   <h3 style="margin-top:18px">📋 د اډمین د فعالیتونو تاریخچه</h3>
   <input id="adminLogSearch" type="text" oninput="filterAdminLogs()" placeholder="🔍 د اډمین، عملیاتو یا هدف نوم ولټوه..." style="width:100%;padding:12px;border-radius:10px;background:#292d33;color:white;border:1px solid #444;margin:8px 0">
   <select id="adminLogActionFilter" onchange="filterAdminLogs()" style="width:100%;padding:12px;border-radius:10px;background:#292d33;color:white;border:1px solid #444;margin:8px 0">
    <option value="all">ټول عملیات</option>
    <option value="حساب بندول">حساب بندول</option>
    <option value="حساب فعالول">حساب فعالول</option>
    <option value="کارن حذف">کارن حذف</option>
    <option value="ویډیو حذف">ویډیو حذف</option>
   </select>
   <input id="adminLogDateFilter" type="date" onchange="filterAdminLogs()" style="width:100%;padding:12px;border-radius:10px;background:#292d33;color:white;border:1px solid #444;margin:8px 0">
   <button onclick="exportAdminLogs()" style="background:#168044;padding:10px;border-radius:9px;width:100%;margin:8px 0">📥 تاریخچه CSV ته صادر کړه</button>
   <div id="adminLogs"><p>تاریخچه بار کېږي...</p></div>
   <button onclick="loadAdminLogs()" style="background:#1769aa;padding:10px;border-radius:9px;width:100%;margin-top:8px">🔄 تاریخچه تازه کړه</button>
   <button onclick="clearAdminLogs()" style="background:#a31515;padding:10px;border-radius:9px;width:100%;margin-top:8px">🗑️ تاریخچه پاکه کړه</button>
   <button onclick="loadAdminPanel()" style="background:#1769aa;padding:10px;border-radius:9px;width:100%;margin-top:8px">🔄 ټول پینل تازه کړه</button>
  `;
  await loadAdminReports();
  await loadAdminLogs();
 }catch(e){
  box.innerHTML="<p style='color:#ff7777'>"+escapeHTML(e.message)+"</p>";
 }
}


async function loadAdminReports(){
 const box=document.getElementById("adminReportsList");
 const token=localStorage.getItem("patangToken");
 if(!box||!token)return;
 box.innerHTML="<p>راپورونه بار کېږي...</p>";
 try{
  const r=await fetch("/api/admin/reports",{headers:{Authorization:"Bearer "+token}});
  const reports=await r.json();
  if(!r.ok)throw new Error(reports.message||"راپورونه نه ښکاري");
  if(!reports.length){
   box.innerHTML="<p>تر اوسه راپور نشته</p>";
   return;
  }
  box.innerHTML=reports.map(report=>`
   <div style="background:#292d33;padding:12px;border-radius:10px;margin:8px 0;border-right:3px solid ${report.status==="new"?"#e6a23c":"#20c56b"}">
    <b>🚩 ${escapeHTML(report.reason||"")}</b>
    <small style="display:block">راپور ورکوونکی: ${escapeHTML(report.reporter||"")}</small>
    <small style="display:block">د ویډیو خاوند: ${escapeHTML(report.videoOwner||"")}</small>
    <small style="display:block">سرلیک: ${escapeHTML(report.caption||"")}</small>
    <small style="display:block">د ویډیو نوم: ${escapeHTML(report.videoName||"")}</small>
    ${report.details?`<p>${escapeHTML(report.details)}</p>`:""}
    <small style="display:block">نېټه: ${escapeHTML(report.createdAt||"")}</small>
    <b style="display:block;margin-top:6px">${report.status==="new"?"🟠 نوی":report.status==="reviewed"?"✅ وکتل شو":"❌ رد شو"}</b>
    ${report.status==="new"?`
     <button onclick="setAdminReportStatus('${encodeURIComponent(report.id)}','reviewed')" style="background:#168044;padding:8px 10px;border-radius:8px;margin:8px 4px">✅ وکتل شو</button>
     <button onclick="setAdminReportStatus('${encodeURIComponent(report.id)}','dismissed')" style="background:#a31515;padding:8px 10px;border-radius:8px;margin:8px 4px">❌ رد شو</button>`:""}
   </div>`).join("");
 }catch(e){
  box.innerHTML="<p style='color:#ff7777'>"+escapeHTML(e.message)+"</p>";
 }
}

async function setAdminReportStatus(encodedId,status){
 const token=localStorage.getItem("patangToken");
 const id=decodeURIComponent(encodedId);
 const action=status==="reviewed"?"وکتل شو":"رد شو";
 if(!confirm("ایا راپور "+action+"؟"))return;
 try{
  const r=await fetch("/api/admin/reports/"+encodeURIComponent(id),{
   method:"PATCH",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
   body:JSON.stringify({status})
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data.message||"حالت بدل نه شو");
  alert(data.message+" ✅");
  await loadAdminReports();
 }catch(e){
  alert(e.message);
 }
}

async function clearAdminLogs(){
 if(!confirm("ایا د اډمین ټوله تاریخچه پاکوې؟\n\nد ټولو پخوانیو اډمین عملیاتو ثبت به پاک شي.\nدا عمل بېرته نه راګرځي.")) return;
 const token=localStorage.getItem("patangToken");
 try{
  const r=await fetch("/api/admin/logs",{
   method:"DELETE",
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.message||"تاریخچه پاکه نه شوه");
  alert(data.message+" ✅");
  await loadAdminLogs();
 }catch(e){
  alert(e.message);
 }
}

let adminLogRecords=[];
let adminLogFilteredRecords=[];

function exportAdminLogs(){
 if(!adminLogFilteredRecords.length){
  alert("د صادرولو لپاره معلومات نشته");
  return;
 }
 const headers=["اډمین","عملیات","هدف","نېټه"];
 const rows=adminLogFilteredRecords.map(log=>[
  log.admin||"",
  log.action||"",
  log.target||"",
  log.date||""
 ]);
 const csv="\\uFEFF"+[headers,...rows].map(row=>
  row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(",")
 ).join("\\r\\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;
 a.download="patang-tik-admin-logs-"+new Date().toISOString().slice(0,10)+".csv";
 document.body.appendChild(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(url);
}

function renderAdminActivityChart(){
 const box=document.getElementById("adminActivityChart");
 if(!box) return;

 const items=[
  {name:"حساب بندول",color:"#e05252"},
  {name:"حساب فعالول",color:"#35b875"},
  {name:"کارن حذف",color:"#e6a23c"},
  {name:"ویډیو حذف",color:"#438ee8"}
 ];

 const total=adminLogRecords.length;
 box.innerHTML=items.map(item=>{
  const count=adminLogRecords.filter(log=>log.action===item.name).length;
  const percent=total ? count/total*100 : 0;
  return `
   <div style="margin:12px 0">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
     <b>${item.name}</b><b>${count}</b>
    </div>
    <div style="height:12px;background:#383d45;border-radius:20px;overflow:hidden">
     <div style="height:100%;width:${percent}%;background:${item.color};border-radius:20px"></div>
    </div>
   </div>`;
 }).join("")+`<p style="text-align:center;margin-top:14px">ټول فعالیتونه: ${total}</p>`;
}

function filterAdminLogs(){
 const box=document.getElementById("adminLogs");
 const search=document.getElementById("adminLogSearch");
 if(!box || !search) return;
 const q=search.value.trim().toLowerCase();
 const actionFilter=document.getElementById("adminLogActionFilter");
 const action=actionFilter ? actionFilter.value : "all";
 const dateFilter=document.getElementById("adminLogDateFilter");
 const selectedDate=dateFilter ? dateFilter.value : "";
 const filtered=adminLogRecords.filter(log=>{
  const textMatch=[log.admin,log.action,log.target,log.date]
   .some(value=>String(value||"").toLowerCase().includes(q));
  const actionMatch=action==="all" || log.action===action;
  const d=log.date ? new Date(log.date) : null;
  const logDate=d && !Number.isNaN(d.getTime())
   ? [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")
   : "";
  const dateMatch=!selectedDate || logDate===selectedDate;
  return textMatch && actionMatch && dateMatch;
 });
 adminLogFilteredRecords=filtered;
 box.innerHTML=filtered.length ? filtered.map(log=>`
  <div style="background:#292d33;padding:10px;border-radius:10px;margin:7px 0">
   <b>${escapeHTML(log.action||"عملیات")}</b>
   <div>👤 اډمین: ${escapeHTML(log.admin||"")}</div>
   <div>🎯 هدف: ${escapeHTML(log.target||"")}</div>
   <small>${escapeHTML(log.date ? new Date(log.date).toLocaleString() : "")}</small>
  </div>`).join("") : "<p>د لټون پایله ونه موندل شوه</p>";
}

async function loadAdminLogs(){
 const box=document.getElementById("adminLogs");
 const token=localStorage.getItem("patangToken");
 if(!box || !token) return;
 box.innerHTML="<p>د فعالیتونو تاریخچه بار کېږي...</p>";
 try{
  const r=await fetch("/api/admin/logs",{
   headers:{Authorization:"Bearer "+token}
  });
  const logs=await r.json();
  if(!r.ok) throw new Error(logs.message || "تاریخچه نه ترلاسه کېږي");
  adminLogRecords=Array.isArray(logs)?logs:[];
  renderAdminActivityChart();
  filterAdminLogs();
 }catch(e){
  box.innerHTML="<p>"+escapeHTML(e.message)+"</p>";
 }
}

async function loadMyVideos(){
 const token=localStorage.getItem("patangToken");
 const box=document.getElementById("myVideos");
 try{
  const r=await fetch("/api/my-videos",{headers:{Authorization:"Bearer "+token}});
  if(!r.ok) throw new Error("د ویډیوګانو ترلاسه کول ناکام شول");
  const videos=await r.json();
  box.innerHTML=videos.length ? `<div class="my-video-grid">${videos.map((v,i)=>`
   <div class="my-video-card">
    <video src="${v.url}" controls playsinline preload="metadata"></video>
    <div class="my-video-title">🎬 زما ویډیو ${i+1}</div>
    <div class="my-video-caption">${escapeHTML(v.caption || "د پتنګ ټیک ویډیو 🇦🇫")}</div>
    <button onclick="deleteMyVideo('${v.name}')" style="background:#a52222;color:white;padding:9px;border-radius:9px;width:100%;margin-top:8px">🗑️ ویډیو حذف کړه</button>
   </div>`).join("")}</div>` : "<p>تر اوسه دې خپله ویډیو نه ده خپره کړې</p>";
 }catch(e){box.innerText="ویډیوګانې نه ښکاري";}
}

async function deleteMyVideo(name){
 if(!confirm("ایا ډاډه یې چې دا ویډیو حذف کړې؟")) return;
 const token=localStorage.getItem("patangToken");
 try{
  const r=await fetch("/api/videos/"+encodeURIComponent(name),{
   method:"DELETE",
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.message || "حذف ناکام شو");
  alert("ویډیو په بریالیتوب حذف شوه ✅");
  await loadMyVideos();
  await loadVideos();
 }catch(e){
  alert(e.message || "ویډیو حذف نه شوه");
 }
}

async function loadFollowRequests(){
 const box=document.getElementById("followRequestsBox");
 box.innerHTML="<p>غوښتنې لوډ کېږي...</p>";
 try{
  const r=await fetch("/api/follow-requests",{
   headers:{Authorization:"Bearer "+localStorage.getItem("patangToken")}
  });
  if(!r.ok) throw new Error("ناکام");
  const requests=await r.json();
  const count=document.getElementById("followRequestCount");
  if(count) count.textContent=requests.length;
  if(!requests.length){
   box.innerHTML="<p>اوس مهال د فالو غوښتنه نشته</p>";
   return;
  }
  box.innerHTML=requests.map(u=>`
   <div style="background:#292929;padding:12px;margin:8px 0;border-radius:10px">
    <b>👤 ${escapeHTML(u.username)}</b>
    <div style="display:flex;gap:8px;margin-top:10px">
     <button onclick="respondFollowRequest('${escapeHTML(u.username)}','accept')" style="background:#168b45;padding:8px 14px;border-radius:8px">منل ✓</button>
     <button onclick="respondFollowRequest('${escapeHTML(u.username)}','reject')" style="background:#b52b2b;padding:8px 14px;border-radius:8px">ردول ✕</button>
    </div>
   </div>`).join("");
 }catch(e){
  box.innerHTML="<p>غوښتنې ونه لوډ شوې؛ بیا هڅه وکړه</p>";
 }
}

async function respondFollowRequest(username,action){
 try{
  const r=await fetch("/api/follow-requests/"+encodeURIComponent(username)+"/"+action,{
   method:"POST",
   headers:{Authorization:"Bearer "+localStorage.getItem("patangToken")}
  });
  const data=await r.json();
  alert(data.message || "بشپړ شو");
  if(r.ok){
   await loadFollowRequests();
   await loadUsers();
  }
 }catch(e){
  alert("له سرور سره اړیکه نشته");
 }
}

async function loadUsers(){
 const token=localStorage.getItem("patangToken");
 const box=document.getElementById("usersBox");
 box.innerText="کارنان لوډ کېږي...";
 try{
  const r=await fetch("/api/users",{headers:{Authorization:"Bearer "+token}});
  if(!r.ok) throw new Error("ناکام");
  const users=await r.json();
  box.innerHTML=users.map(u=>{
   let btn=u.isMe ? "دا ستا حساب دی" : u.isFollowing
    ? `<button onclick="followUser('${u.username}',true)">تعقیب پرېږده</button>`
    : u.requestSent
     ? `<button disabled style="background:#555">غوښتنه لېږل شوې ✓</button>`
     : `<button onclick="followUser('${u.username}',false)">فالو غوښتنه ➕</button>`;
   const avatar = u.avatar
    ? `<img src="${escapeHTML(u.avatar)}" alt="عکس" style="width:48px;height:48px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:8px">`
    : `<span style="font-size:30px;vertical-align:middle;margin-left:8px">👤</span>`;
   return `<div style="background:#292929;padding:10px;margin:8px 0;border-radius:8px">
    ${avatar}<b>${escapeHTML(u.username)}</b>
    <p>پلویان: ${u.followers} | تعقیبوي: ${u.following}</p>
    ${btn}
   </div>`;
  }).join("") || "تر اوسه بل کارن نشته";
 }catch(e){box.innerText="د کارنانو په ترلاسه کولو کې ستونزه ده";}
}
async function followUser(username,isFollowing){
 const token=localStorage.getItem("patangToken");
 const action=isFollowing ? "unfollow" : "follow";
 try{
  const r=await fetch("/api/"+action+"/"+encodeURIComponent(username),{
   method:"POST",
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  alert(data.message || "بشپړ شو");
  if(r.ok) await loadUsers();
 }catch(e){alert("له سرور سره اړیکه نشته");}
}
async function uploadAvatar(input){
 const file=input.files && input.files[0];
 if(!file) return;
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
  alert("یوازې JPG، PNG یا WebP عکس وټاکه");
  input.value="";
  return;
 }
 if(file.size>5*1024*1024){
  alert("عکس باید تر ۵ MB کم وي");
  input.value="";
  return;
 }
 const form=new FormData();
 form.append("avatar",file);
 try{
  const r=await fetch("/api/avatar",{
   method:"POST",
   headers:{Authorization:"Bearer "+localStorage.getItem("patangToken")},
   body:form
  });
  const data=await r.json();
  if(!r.ok){
   alert(data.message || "عکس پورته نه شو");
   return;
  }
  document.getElementById("profileAvatar").src=data.avatar+"?t="+Date.now();
  alert(data.message || "عکس بدل شو");
 }catch(e){
  alert("له سرور سره اړیکه نشته");
 }finally{
  input.value="";
 }
}

function showProfile(username){
 document.getElementById("profileInfo").style.display="block";
 document.getElementById("profileName").innerText="کارن نوم: "+username;
}
async function deleteMyAccount(){
 const passwordInput = document.getElementById("deleteAccountPassword");
 const password = passwordInput.value;
 if(!password){
  alert("لومړی خپل پاسورډ ولیکه");
  return;
 }
 const confirmed = confirm("ایا ډاډه یې چې خپل حساب حذف کړې؟ حساب، اړیکې، پیغامونه، خبرتیاوې او ستا تبصرې او ځوابونه به حذف شي. ویډیوګانې او راپورونه به پاتې وي. دا عمل بېرته نه راګرځي.");
 if(!confirmed){
  passwordInput.value="";
  return;
 }
 const token = localStorage.getItem("patangToken");
 if(!token){
  passwordInput.value="";
  alert("مهرباني وکړه لومړی حساب ته ننوځه");
  return;
 }
 try{
  const response = await fetch("/api/account", {
   method:"DELETE",
   headers:{
    "Authorization":"Bearer "+token,
    "Content-Type":"application/json"
   },
   body:JSON.stringify({password})
  });
  const data = await response.json();
  if(!response.ok){
   throw new Error(data.message || "حساب حذف نه شو");
  }
  passwordInput.value="";
  document.getElementById("deleteAccountBox").style.display="none";
  logoutUser();
  closeAuth();
  alert(data.message);
 }catch(error){
  alert(error.message || "له سرور سره اړیکه ستونزه لري");
 }finally{
  passwordInput.value="";
 }
}

function logoutUser(){
 if(followNoticeTimer){
  clearInterval(followNoticeTimer);
  followNoticeTimer=null;
 }
 if(messageNoticeTimer){
  clearInterval(messageNoticeTimer);
  messageNoticeTimer=null;
 }
 if(notificationTimer){
  clearInterval(notificationTimer);
  notificationTimer=null;
 }
 localStorage.removeItem("patangToken");
 document.getElementById("profileInfo").style.display="none";
 document.getElementById("authStatus").innerText="له حسابه ووتلې";
}
let currentUsername = "";

let followNoticeTimer = null;

function startFollowNotifications(){
 if(followNoticeTimer) clearInterval(followNoticeTimer);
 const token=localStorage.getItem("patangToken");
 if(!token) return;
 let knownRequests=null;
 const updateCount=async()=>{
  try{
   const r=await fetch("/api/follow-requests",{
    headers:{Authorization:"Bearer "+token}
   });
   if(!r.ok) return;
   const requests=await r.json();
   const count=document.getElementById("followRequestCount");
   if(count) count.textContent=requests.length;
   const currentNames=new Set(requests.map(u=>u.username));
   if(knownRequests!==null){
    const newNames=[...currentNames].filter(name=>!knownRequests.has(name));
    if(newNames.length){
     alert("🔔 نوې فالو غوښتنه!\nله دې کارن څخه: "+newNames.join("، ")+"\nد فالو غوښتنې تڼۍ پرانیزئ.");
    }
   }
   knownRequests=currentNames;
  }catch(e){}
 };
 updateCount();
 followNoticeTimer=setInterval(updateCount,5000);
}

let messageNoticeTimer = null;

async function loadUnreadMessageCount(){
 const badge=document.getElementById("messageCount");
 const token=localStorage.getItem("patangToken");
 if(!badge)return;
 if(!token){badge.textContent="";return;}
 try{
  const r=await fetch("/api/messages/unread-count",{
   headers:{Authorization:"Bearer "+token}
  });
  if(!r.ok)return;
  const data=await r.json();
  badge.textContent=data.count>0?String(data.count):"";
 }catch(e){}
}

function startMessageNotifications(){
 if(messageNoticeTimer) clearInterval(messageNoticeTimer);
 const token=localStorage.getItem("patangToken");
 if(!token) return;
 let knownMessageIds=null;

 const updateMessages=async()=>{
  loadUnreadMessageCount();
  try{
   const r=await fetch("/api/notifications",{
    headers:{Authorization:"Bearer "+token}
   });
   if(!r.ok) return;
   const items=await r.json();
   const watched=items.filter(n=>n.type==="message" || n.type==="comment");
   const currentIds=new Set(watched.map(n=>n.id));

   if(knownMessageIds!==null){
    const fresh=watched.filter(n=>!knownMessageIds.has(n.id));
    fresh.forEach(n=>{
     if(n.type==="comment"){
      alert("🔔 نوې تبصره!\\nله: "+(n.from||"کارن")+"\\nتبصره: "+(n.comment||n.text||"نوی نظر"));
     }else{
      alert("✉️ نوی شخصي پیغام!\\nله: "+(n.from||"کارن")+"\\nد پیغامونو د لیدلو لپاره مسیجونه پرانیزئ.");
     }
    });
   }
   knownMessageIds=currentIds;
  }catch(e){}
 };

 updateMessages();
 messageNoticeTimer=setInterval(updateMessages,5000);
}

async function checkMe(){
 const token=localStorage.getItem("patangToken");
 if(!token)return;
 try{
  const r=await fetch("/api/me",{headers:{Authorization:"Bearer "+token}});
  if(!r.ok){
   localStorage.removeItem("patangToken");
   document.getElementById("profileInfo").style.display="none";
   document.getElementById("authStatus").innerText="مهرباني وکړئ بیا حساب ته ننوځئ";
   return;
  }
  const d=await r.json();
  currentUsername=d.username;
  const adminButton=document.getElementById("adminPanelButton");
  if(adminButton) adminButton.style.display=d.role==="admin"?"block":"none";
  const avatar=document.getElementById("profileAvatar");
  avatar.src=d.avatar ? d.avatar+"?t="+Date.now() : "";
  document.getElementById("authStatus").innerText="ستاسو پروفایل: "+d.username;
  showProfile(d.username);
  loadMyVideos();
  startFollowNotifications();
  startMessageNotifications();
  startNotificationUpdates();
 }catch(e){}
}

function uploadWithProgress(data,token,onProgress){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open("POST","/upload");
  xhr.setRequestHeader("Authorization","Bearer "+token);
  xhr.upload.onprogress=e=>{
   if(e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100));
  };
  xhr.onload=()=>{
   let result={};
   try{result=JSON.parse(xhr.responseText||"{}");}
   catch(e){reject(new Error("د سرور ځواب سم نه دی"));return;}
   if(xhr.status<200||xhr.status>=300){
    reject(new Error(result.message||"اپلوډ ناکام شو"));
    return;
   }
   resolve(result);
  };
  xhr.onerror=()=>reject(new Error("د شبکې ستونزه"));
  xhr.onabort=()=>reject(new Error("اپلوډ ودرېد"));
  xhr.send(data);
 });
}

function showUploadProgress(percent){
 const box=document.getElementById("uploadProgressBox");
 if(!box)return;
 if(box.parentElement!==document.body)document.body.appendChild(box);
 Object.assign(box.style,{
  display:"block",position:"fixed",left:"16px",right:"16px",
  bottom:"95px",zIndex:"999999",background:"#191d23",
  border:"1px solid #20c56b",borderRadius:"14px",
  padding:"14px",boxShadow:"0 8px 30px #0009"
 });
 const bar=document.getElementById("uploadProgressBar");
 const label=document.getElementById("uploadProgressPercent");
 const message=document.getElementById("uploadProgressText");
 if(bar)bar.style.width=percent+"%";
 if(label)label.textContent=percent+"%";
 if(message)message.textContent=
  percent>=100?"ویډیو پروسس کېږي...":"ویډیو پورته کېږي...";
}

function hideUploadProgress(){
 const box=document.getElementById("uploadProgressBox");
 if(box)box.style.display="none";
 const bar=document.getElementById("uploadProgressBar");
 if(bar)bar.style.width="0%";
 const percent=document.getElementById("uploadProgressPercent");
 if(percent)percent.textContent="0%";
}

async function uploadVideo(input){
 const file=input.files[0];
 if(!file)return;
 const token=localStorage.getItem("patangToken");
 if(!token){
  alert(langText("loginBeforeUpload"));
  openAuth();
  input.value="";
  return;
 }
 const caption=prompt(langText("publishCaption"))||"";
 const data=new FormData();
 data.append("video",file);
 data.append("caption",caption);
 try{
  showUploadProgress(0);
  await uploadWithProgress(data,token,showUploadProgress);
  showUploadProgress(100);
  alert(langText("uploadSuccess"));
  hideUploadProgress();
  await loadVideos();
 }catch(error){
  hideUploadProgress();
  alert(langText("uploadFileFailed")+": "+error.message);
 }finally{
  input.value="";
 }
}

let activeChatUser = "";
let messageRefreshTimer = null;

function openMessages(){
 const token=localStorage.getItem("patangToken");
 if(!token){
  alert("لومړی خپل حساب ته ننوځه");
  openAuth();
  return;
 }
 document.getElementById("messagesModal").style.display="flex";
 loadMessageUsers();
 if(messageRefreshTimer) clearInterval(messageRefreshTimer);
 messageRefreshTimer=setInterval(()=>{
  if(activeChatUser && document.getElementById("messagesModal").style.display==="flex"){
   loadChat();
  }
 },3000);
}

function closeMessages(){
 document.getElementById("messagesModal").style.display="none";
 activeChatUser="";
 if(messageRefreshTimer){
  clearInterval(messageRefreshTimer);
  messageRefreshTimer=null;
 }
}

async function loadMessageUsers(){
 const box=document.getElementById("messageUsers");
 box.innerHTML="<p>"+langText("usersLoading")+"</p>";
 try{
  const r=await fetch("/api/users",{
   headers:{Authorization:"Bearer "+localStorage.getItem("patangToken")}
  });
  if(!r.ok) throw new Error(langText("usersFailed"));
  const users=await r.json();
  box.innerHTML="";
  users.forEach(u=>{
   if(u.isMe) return;
   const name=String(u.username||"");
   if(!name) return;
   const btn=document.createElement("button");
   btn.className="message-user";
   btn.textContent="👤 "+name;
   btn.style.cssText="display:block;width:100%;text-align:right;padding:12px;margin:5px 0;background:#292d33;border-radius:12px;font-size:15px";
   btn.addEventListener("click",()=>openChat(name));
   box.appendChild(btn);
  });
  if(!box.children.length) box.innerHTML="<p>"+langText("noOtherUsers")+"</p>";
 }catch(e){
  box.innerHTML="<p>"+langText("usersFailed")+"</p>";
 }
}

async function openChat(username){
 activeChatUser=username;
 document.getElementById("chatTitle").textContent="💬 "+username;
 try{
  await fetch("/api/messages/"+encodeURIComponent(username)+"/read",{
   method:"POST",
   headers:{Authorization:"Bearer "+localStorage.getItem("patangToken")}
  });
 }catch(e){}
 await loadChat();
 await loadUnreadMessageCount();
}

async function loadChat(){
 if(!activeChatUser) return;
 const box=document.getElementById("chatMessages");
 if(!box.innerHTML.trim()) box.innerHTML="<p>"+langText("messagesLoading")+"</p>";
 try{
  const r=await fetch("/api/messages/"+encodeURIComponent(activeChatUser),{
   headers:{Authorization:"Bearer "+localStorage.getItem("patangToken")}
  });
  if(!r.ok) throw new Error(langText("messagesFailed"));
  const messages=await r.json();
  box.innerHTML=messages.map(m=>`
   <div style="margin:9px 0;padding:11px;border-radius:13px;background:${m.from===activeChatUser?"#292d33":"#145c37"};overflow-wrap:anywhere">
    <b>${escapeHTML(m.from)}</b>
    <p style="margin:6px 0">${escapeHTML(m.text)}</p>
    <small>${escapeHTML(new Date(m.date).toLocaleString())}</small>
   </div>`).join("") || "<p>"+langText("noMessages")+"</p>";
  box.scrollTop=box.scrollHeight;
 }catch(e){
  box.innerHTML="<p>"+langText("messagesFailed")+"</p>";
 }
}

async function sendPrivateMessage(){
 const input=document.getElementById("privateMessageInput");
 const text=input.value.trim();
 if(!activeChatUser){
  alert(langText("chooseUserAlert"));
  return;
 }
 if(!text) return;
 try{
  const r=await fetch("/api/messages/"+encodeURIComponent(activeChatUser),{
   method:"POST",
   headers:{
    "Content-Type":"application/json",
    Authorization:"Bearer "+localStorage.getItem("patangToken")
   },
   body:JSON.stringify({text})
  });
  const data=await r.json();
  if(!r.ok){
   alert(data.message||langText("sendFailed"));
   return;
  }
  input.value="";
  await loadChat();
 }catch(e){
  alert(langText("serverConnectionFailed"));
 }
}

let notificationTimer = null;

function closeNotifications(){
 document.getElementById("notificationsModal").style.display="none";
}

async function loadNotifications(){
 const token=localStorage.getItem("patangToken");
 if(!token) return;
 try{
  const r=await fetch("/api/notifications",{
   headers:{Authorization:"Bearer "+token}
  });
  if(!r.ok) return;
  const items=await r.json();
  const unread=items.filter(n=>!n.read).length;
  const badge=document.getElementById("notificationCount");
  if(badge) badge.textContent=unread ? unread : "";
  const box=document.getElementById("notificationsList");
  if(!box) return;
  if(!items.length){
   box.innerHTML="<p style='text-align:center;color:#aaa'>"+langText("noNotifications")+" 🔔</p>";
  }else{
   box.innerHTML=items.map(n=>{
    const icons={like:"❤️",comment:"💬",follow:"👤",message:"✉️"};
    return `<div style="padding:13px;margin-bottom:10px;background:${n.read?"#22262c":"#26352e"};border:1px solid #343b42;border-radius:15px">
     <div style="display:flex;gap:9px;align-items:center">
      <span style="font-size:23px">${icons[n.type]||"🔔"}</span>
      <div style="flex:1;min-width:0">
       <b>@${escapeHTML(n.from||langText("user"))}</b>
       <p style="margin:5px 0;color:#ddd">${escapeHTML(n.text||langText("newNotification"))}</p>
       ${n.comment?`<p style="margin:4px 0;color:#aaa">${escapeHTML(n.comment)}</p>`:""}
       <small style="color:#999">${n.date?new Date(n.date).toLocaleString():""}</small>
      </div>
      ${n.read?"":"<span style='color:#20c56b'>●</span>"}
     </div>
    </div>`;
   }).join("");
  }
  const modal=document.getElementById("notificationsModal");
  if(unread && modal && modal.style.display==="flex"){
   await fetch("/api/notifications/read",{
    method:"POST",
    headers:{Authorization:"Bearer "+token}
   });
   if(badge) badge.textContent="";
  }
 }catch(e){
  const box=document.getElementById("notificationsList");
  if(box) box.innerHTML="<p>"+langText("notificationsFailed")+"</p>";
 }
}

function openNotifications(){
 const token=localStorage.getItem("patangToken");
 if(!token){
  alert(langText("loginForNotifications"));
  openAuth();
  return;
 }
 document.getElementById("notificationsModal").style.display="flex";
 loadNotifications();
}

function startNotificationUpdates(){
 if(notificationTimer) clearInterval(notificationTimer);
 if(!localStorage.getItem("patangToken")) return;
 loadNotifications();
 notificationTimer=setInterval(loadNotifications,10000);
}

function escapeHTML(value){
 return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function recordVideoView(video,name){
 const token=localStorage.getItem("patangToken");
 if(!token) return;

 try{
  const r=await fetch("/api/videos/"+encodeURIComponent(name)+"/view",{
   method:"POST",
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok) return;

  const card=video.closest("div[style*='scroll-snap-align']");
  const label=card ? card.querySelector("[data-view-count]") : null;
  if(label) label.innerText="👁️ "+data.views+" لیدنې";
 }catch(e){
  console.log("د لیدنو ثبت ناکام شو");
 }
}

function setupVideoAutoPlay(){
 const box=document.getElementById("videoBox");
 if(!box || !("IntersectionObserver" in window)) return;

 if(window.patangVideoObserver) window.patangVideoObserver.disconnect();

 window.patangVideoObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
   const video=entry.target;
   if(entry.isIntersecting && entry.intersectionRatio>=0.65){
    box.querySelectorAll("video").forEach(other=>{
     if(other!==video) other.pause();
    });
    video.muted=true;
    const result=video.play();
    if(result && result.catch) result.catch(()=>{});
   }else{
    video.pause();
   }
  });
 },{root:box,threshold:[0,0.65,1]});

 box.querySelectorAll("video").forEach(video=>{
  window.patangVideoObserver.observe(video);
 });
}

async function loadVideos(){
 try{
  const r=await fetch("/api/videos");
  const videos=await r.json();
  const box=document.getElementById("videoBox");
  document.getElementById("videoCount").innerText="ویډیوګانې: "+videos.length;
  if(!videos.length){
   box.innerHTML="<p>تر اوسه ویډیو نشته</p>";
   return;
  }
  box.innerHTML=videos.map(v=>`
   <div style="position:relative;flex:0 0 100%;height:100%;scroll-snap-align:start;background:#000">
    <video src="${v.url}" controls playsinline onplay="recordVideoView(this, '${v.name}')" style="width:100%;height:100%;object-fit:contain;background:#000"></video>
    <div class="feed-caption">
     <b>@${escapeHTML(v.owner || "PATANG")}</b>
     <p>${escapeHTML(v.caption || "🇦🇫 د پتنګ ټیک ویډیو")}</p>
     <small data-view-count>👁️ ${Number(v.views)||0} لیدنې</small>
    </div>
    <button class="feed-action like-action" onclick="like(this,'${v.name}')" data-liked="no">🤍<small>${Number(v.likes)||0}</small></button>
    <button class="feed-action comment-action" onclick="commentVideo('${v.name}')">💬<small>${(v.comments||[]).length} تبصرې</small></button>
    <button class="feed-action share-action" onclick="shareVideo('${v.name}')">↗️<small>شریکول</small></button>
    <button class="feed-action report-action" onclick="reportVideo('${v.name}')">🚩<small>راپور</small></button>
   </div>`).join("");
  setupVideoAutoPlay();
 }catch(e){
  document.getElementById("videoBox").innerHTML="<p>ویډیو نه ښکاري</p>";
 }
}
loadVideos();
let count=0;
async function like(btn,name){
 if(btn.dataset.busy==="yes") return;
 btn.dataset.busy="yes";
 try{
  const token=localStorage.getItem("patangToken");
  if(!token){
   alert("د لایک لپاره لومړی حساب ته ننوځه");
   openAuth();
   return;
  }
  const r=await fetch("/api/videos/"+encodeURIComponent(name)+"/like",{
   method:"POST",
   headers:{Authorization:"Bearer "+token}
  });
  if(!r.ok) throw new Error("Like failed");
  const data=await r.json();
  const likeCount=btn.querySelector("small");
  likeCount.innerText=data.likes;
  likeCount.classList.remove("like-count-pop");
  void likeCount.offsetWidth;
  likeCount.classList.add("like-count-pop");
  btn.dataset.liked=data.liked?"yes":"no";
  btn.firstChild.textContent=data.liked?"❤️":"🤍";
 }catch(e){alert("لایک ثبت نه شو؛ سرور وګوره");}
 finally{btn.dataset.busy="no";}
}

async function reportVideo(name){
 const token=localStorage.getItem("patangToken");
 if(!token){
  alert("د راپور لپاره لومړی حساب ته ننوځه");
  openAuth();
  return;
 }
 const reasons=["ځورونه","سپکاوی","ناسم معلومات","سپم یا جعلي محتوا","نور"];
 const choice=prompt("د راپور دلیل ولیکه:\n"+reasons.map((r,i)=>(i+1)+". "+r).join("\n")+"\n\nیوازې د دلیل شمېره ولیکه (۱ تر ۵):");
 if(choice===null)return;
 const index=Number(choice.trim())-1;
 if(!Number.isInteger(index)||index<0||index>=reasons.length){
  alert("سمه شمېره وټاکه");
  return;
 }
 const details=prompt("که نور وضاحت لرې، دلته یې ولیکه (اختیاري):")||"";
 try{
  const r=await fetch("/api/reports",{
   method:"POST",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
   body:JSON.stringify({videoName:name,reason:reasons[index],details})
  });
  const data=await r.json();
  alert(data.message||"راپور ثبت نه شو");
 }catch(e){
  alert("له سرور سره اړیکه ونه شوه");
 }
}

async function shareVideo(name){
 const link=location.origin+"/videos/"+encodeURIComponent(name);
 try{
  if(navigator.share) await navigator.share({title:"PATANG TIK",url:link});
  else if(navigator.clipboard){await navigator.clipboard.writeText(link);alert("د ویډیو لینک کاپي شو");}
  else alert(link);
 }catch(e){}
}

let activeCommentVideo="";

async function commentVideo(name){
 activeCommentVideo=name;
 document.getElementById("commentsModal").style.display="flex";
 await loadComments();
}

function closeComments(){
 document.getElementById("commentsModal").style.display="none";
 activeCommentVideo="";
}

async function loadComments(){
 try{
  const token=localStorage.getItem("patangToken");
  if(token){
   const me=await fetch("/api/me",{headers:{Authorization:"Bearer "+token}});
   if(me.ok){
    const user=await me.json();
    currentUsername=user.username;
   }
  }
  const r=await fetch("/api/videos");
  const videos=await r.json();
  const video=videos.find(v=>v.name===activeCommentVideo);
  const comments=video?.comments||[];
  const box=document.getElementById("commentsList");
  box.innerHTML=comments.length
   ? comments.map((c,i)=>`
    <div style="padding:12px;border-bottom:1px solid #444">
     💬 <b>@${escapeHTML(c.owner || "PATANG")}</b>: ${escapeHTML(c.text)}
     <small style="display:block;color:#aaa">${new Date(c.date).toLocaleString()}</small>
     ${c.owner === currentUsername ? `<button onclick="editComment(${i})" style="margin-top:8px;background:#1769aa;padding:6px 12px;border-radius:8px">✏️ سمول</button> <button onclick="deleteComment(${i})" style="margin-top:8px;background:#9b2222;padding:6px 12px;border-radius:8px">🗑️ حذف</button>` : ""}
     <button onclick="likeComment(${i})" style="margin-top:8px;background:transparent;color:#ff5b75;padding:5px">❤️ <span>${Number(c.likes)||0}</span></button>
     ${(c.replies||[]).map(reply=>`
      <div style="margin:10px 0 0 22px;padding:8px;background:#333;border-radius:8px">
       ↳ <b>@${escapeHTML(reply.owner || "PATANG")}</b>: ${escapeHTML(reply.text)}
       <small style="display:block;color:#aaa">${new Date(reply.date).toLocaleString()}</small>
      </div>`).join("")}
     <button onclick="replyToComment(${i})" style="margin-top:8px;background:#168b45;padding:6px 12px;border-radius:8px">↩️ ځواب (${(c.replies||[]).length})</button>
    </div>`).join("")
   : "<p style='text-align:center;color:#aaa'>تر اوسه تبصره نشته</p>";
 }catch(e){
  document.getElementById("commentsList").innerText="تبصرې نه ښکاري";
 }
}

async function editComment(index){
 const token=localStorage.getItem("patangToken");
 const videos=await fetch("/api/videos").then(r=>r.json());
 const video=videos.find(v=>v.name===activeCommentVideo);
 const comment=video?.comments?.[index];
 if(!comment || comment.owner!==currentUsername){
  alert("یوازې خپله تبصره سمولی شې");
  return;
 }
 const updated=prompt("خپله تبصره سمه کړه:",comment.text);
 if(updated===null)return;
 if(!updated.trim())return alert("تبصره تشه ده");
 try{
  const r=await fetch("/api/videos/"+encodeURIComponent(activeCommentVideo)+"/comment/"+index,{
   method:"PUT",
   headers:{
    "Content-Type":"application/json",
    "Authorization":"Bearer "+token
   },
   body:JSON.stringify({comment:updated.trim()})
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data.message || "سمول ونه شول");
  await loadComments();
  await loadVideos();
 }catch(e){
  alert(e.message || "تبصره سمه نه شوه");
 }
}

async function deleteComment(index){
 if(!confirm("ایا خپله تبصره حذفوې؟"))return;
 try{
  const token=localStorage.getItem("patangToken");
  const r=await fetch("/api/videos/"+encodeURIComponent(activeCommentVideo)+"/comment/"+index,{
   method:"DELETE",
   headers:{Authorization:"Bearer "+token}
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data.message || "حذف ونه شو");
  await loadComments();
  await loadVideos();
 }catch(e){
  alert(e.message || "تبصره حذف نه شوه");
 }
}

async function likeComment(index){
 try{
  const token=localStorage.getItem("patangToken");
  if(!token) throw new Error("لومړی خپل حساب ته ننوځه");
  const r=await fetch("/api/videos/"+encodeURIComponent(activeCommentVideo)+"/comment/"+index+"/like",{
   method:"POST",
   headers:{Authorization:"Bearer "+token}
  });
  if(!r.ok)throw new Error();
  await loadComments();
 }catch(e){
  alert("خوښونه ثبت نه شوه؛ بیا هڅه وکړه");
 }
}

async function replyToComment(index){
 const reply=prompt("دې تبصرې ته ځواب ولیکئ:");
 if(!reply || !reply.trim())return;
 try{
  const token=localStorage.getItem("patangToken");
  if(!token) throw new Error("لومړی خپل حساب ته ننوځه");
  const r=await fetch("/api/videos/"+encodeURIComponent(activeCommentVideo)+"/comment/"+index+"/reply",{
   method:"POST",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
   body:JSON.stringify({reply:reply.trim()})
  });
  if(!r.ok)throw new Error();
  await loadComments();
 }catch(e){
  alert("ځواب ونه لېږل شو؛ بیا هڅه وکړه");
 }
}

async function sendComment(){
 const input=document.getElementById("newComment");
 const comment=input.value.trim();
 if(!comment)return;
 if(!activeCommentVideo)return;
 try{
  const r=await fetch("/api/videos/"+encodeURIComponent(activeCommentVideo)+"/comment",{
   method:"POST",
   headers:{
    "Content-Type":"application/json",
    "Authorization":"Bearer "+localStorage.getItem("patangToken")
   },
   body:JSON.stringify({comment})
  });
  if(!r.ok)throw new Error();
  input.value="";
  await loadComments();
  await loadVideos();
 }catch(e){
  alert("تبصره ونه لېږل شوه؛ بیا هڅه وکړه");
 }
}
