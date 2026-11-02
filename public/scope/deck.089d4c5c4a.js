
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide')), stage=document.getElementById('stage'),
      bar=document.querySelector('#bar>i'), count=document.getElementById('count'), notes=document.getElementById('notes'), i=0;
  function fit(){var s=Math.min(innerWidth/1920,(innerHeight-(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--theater-bar"))||0))/1080);stage.style.transform='translate(-50%,-50%) scale('+s+')';}
  function show(n){
    i=Math.max(0,Math.min(slides.length-1,n));
    slides.forEach(function(s,k){s.classList.toggle('on',k===i);});
    bar.style.width=((i+1)/slides.length*100)+'%';
    count.textContent=(i+1)+' / '+slides.length;
    var a=slides[i].querySelector('aside'); notes.textContent=a?a.textContent.trim():'No speaker notes.';
    history.replaceState(null,'','#'+(i+1));
  }
  addEventListener('resize',fit);
  addEventListener('keydown',function(e){
    var k=e.key;
    if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'){e.preventDefault();show(i+1);}
    else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'){e.preventDefault();show(i-1);}
    else if(k==='Home')show(0); else if(k==='End')show(slides.length-1);
    else if(k==='n'||k==='N')notes.classList.toggle('show');
    else if(k==='f'||k==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}
  });
  addEventListener('click',function(e){if(notes.contains(e.target))return;show(e.clientX>innerWidth/2?i+1:i-1);});
  var x0=null;
  addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
  addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40)show(i+(dx<0?1:-1));x0=null;});
  window.__deckShow=show;fit();show((parseInt(location.hash.slice(1),10)||1)-1);
})();
