"""Generate native shape/action authoring inputs for Tesseract CLI 0.3.1."""
import json,math
from pathlib import Path
brass=[199/255,163/255,106/255,1];ink=[157/255,89/255,78/255,1]
identity={'anchorPoint':[0,0],'position':[0,0],'scale':[100,100],'rotation':0,'opacity':100}
acts=[]
def arc(r,start,end):
    steps=72;commands=[]
    for i in range(steps+1):
        t=math.radians(start+(end-start)*i/steps)
        commands.append({'type':'moveTo' if i==0 else 'lineTo','x':200+r*math.cos(t),'y':200+r*math.sin(t)})
    return commands

def line(points):
    return [{'type':'moveTo' if i==0 else 'lineTo','x':p[0],'y':p[1]} for i,p in enumerate(points)]
def shape(i,name,commands,color=brass,width=1.5,opacity=1):
    payload={'path':{'commands':commands},'fills':[],'strokes':[{'paint':{'type':'solid','color':color},'width':width,'cap':'round','join':'round','miterLimit':4,'blendMode':'normal','opacity':opacity}],'trim':{'start':0,'end':100,'offset':0,'mode':'simultaneously'}}
    acts.append({'type':'createFxShapeLayer','compositionId':'main','layerId':i,'name':name,'activeRange':{'start':0,'duration':1800},'transform':identity.copy(),'shape':payload})
shape(1,'Brass seal / left fracture half',arc(116,96,264),width=1.65)
shape(2,'Brass seal / right fracture half',arc(116,-84,84),width=1.65)
shape(3,'Inner left engraved arc',arc(99,109,251),width=.85,opacity=.65)
shape(4,'Inner right engraved arc',arc(99,-71,71),width=.85,opacity=.65)
ticks=[]
for a in [0,45,90,135,180,225,270,315]:
    t=math.radians(a);ticks+=line([(200+123*math.cos(t),200+123*math.sin(t)),(200+128*math.cos(t),200+128*math.sin(t))])
shape(5,'Eight engraved radial marks',ticks,width=.9,opacity=.75)
shape(6,'Central diamond / printed geometry',line([(200,176),(216,200),(200,224),(184,200),(200,176)]),width=1.15,opacity=.9)
shape(7,'Muted red ink / central fracture',line([(201,81),(195,119),(209,151),(191,183),(207,216),(193,250),(200,284),(197,319)]),ink,width=1.7,opacity=.95)
shape(8,'Fracture / small branch',line([(201,204),(220,222),(235,225)]),ink,width=1.05,opacity=.6)
acts.append({'type':'groupFxCompositionLayers','compositionId':'main','layerIds':list(range(1,9)),'groupLayerId':100,'name':'Omen seal / native editable overlay','transform':identity.copy()})
def anim(i,p,body):
 acts.append({'type':'setFxPropertyAnimator','compositionId':'main','property':{'layerId':i,'propertyType':p},'animator':{'type':'jsScript','layerTimeJsCode':body},'dependencies':[]})
# All samples are deterministic on the owning layer clock. No loops or wall time.
anim(100,'opacity','const t=input.time.seconds; const a=Math.max(0,Math.min(1,t/0.18)); const b=Math.max(0,Math.min(1,(1.8-t)/0.5)); return 100*a*b;')
for i in range(1,7):
 anim(i,'trimEnd','const u=Math.max(0,Math.min(1,(input.time.seconds-0.05)/0.5)); return 100*(1-Math.pow(1-u,3));')
for i in [1,3]:
 anim(i,'positionX','const u=Math.max(0,Math.min(1,(input.time.seconds-0.55)/0.38)); return -4*(1-Math.pow(1-u,3));')
for i in [2,4]:
 anim(i,'positionX','const u=Math.max(0,Math.min(1,(input.time.seconds-0.55)/0.38)); return 4*(1-Math.pow(1-u,3));')
for i,delay in [(7,.48),(8,.76)]:
 anim(i,'trimEnd',f'const u=Math.max(0,Math.min(1,(input.time.seconds-{delay})/0.38)); return 100*(1-Math.pow(1-u,3));')
 anim(i,'opacity',f'const u=Math.max(0,Math.min(1,(input.time.seconds-{delay})/0.16)); return 100*u;')
Path('.tesseract-work/edits.json').write_text(json.dumps(acts,indent=2)+'\n')
