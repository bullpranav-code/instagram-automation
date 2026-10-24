import numpy as np, wave
SR=44100
def env(n,a=0.002,d=0.2):
    t=np.arange(n)/SR; e=np.exp(-t/d); k=int(a*SR); e[:k]*=np.linspace(0,1,k); return e
def kick(l=0.35):
    n=int(l*SR); t=np.arange(n)/SR; f=50+100*np.exp(-t*30); return np.sin(2*np.pi*np.cumsum(f)/SR)*env(n,0.001,0.18)
def chenda(pitch=220,l=0.18,bright=0.6):   # stick-on-drumhead: pitched thud + slap noise
    n=int(l*SR); t=np.arange(n)/SR; f=pitch*(1+0.6*np.exp(-t*60))
    body=np.sin(2*np.pi*np.cumsum(f)/SR)*env(n,0.0005,0.06)
    slap=np.random.randn(n)*env(n,0.0002,0.012)*bright
    return body*0.8+slap
def clap(l=0.2):
    n=int(l*SR); x=np.random.randn(n)
    e=np.zeros(n)
    for o in (0,0.01,0.02): k=int(o*SR); e[k:]+=env(n-k,0.0005,0.05)
    return x*e*0.5
def hat(l=0.05):
    n=int(l*SR); x=np.random.randn(n); x=np.diff(np.concatenate([[0],x])); return x*env(n,0.0003,0.015)*0.35
def bell(freq,l=0.25):
    n=int(l*SR); t=np.arange(n)/SR
    return (np.sin(2*np.pi*freq*t)+0.6*np.sin(2*np.pi*freq*2.76*t)+0.3*np.sin(2*np.pi*freq*5.4*t))*env(n,0.001,0.09)*0.3
def bass808(freq,l):
    n=int(l*SR); t=np.arange(n)/SR; f=freq*(1+0.5*np.exp(-t*25))
    x=np.sin(2*np.pi*np.cumsum(f)/SR); x=np.tanh(2.2*x)
    return x*env(n,0.003,l*0.6)*0.55
def lead(freq,l):
    n=int(l*SR); t=np.arange(n)/SR; vib=1+0.006*np.sin(2*np.pi*5.5*t)
    ph=np.cumsum(freq*vib)/SR; x=2*(ph%1)-1  # saw
    x=x*0.5+0.5*np.sin(2*np.pi*ph)
    e=np.minimum(1,t/0.01)*np.exp(-t/(l*0.9)); return x*e*0.18
def place(buf,s,at):
    i=int(at*SR); j=min(len(buf),i+len(s)); buf[i:j]+=s[:j-i]
def norm(x,peak=0.89):
    x=np.tanh(x*1.2); return x/np.max(np.abs(x))*peak
def save(name,x):
    st=np.stack([x,np.roll(x,int(0.008*SR))*0.92],1)
    d=(st*32767).astype(np.int16)
    w=wave.open(name,'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes()); w.close()
np.random.seed(27)
# scale: D minor-ish / Kerala flavour (D, E, F, A, Bb, C) -> phrygian-dominant touches
N={'D3':146.8,'F3':174.6,'G3':196,'A3':220,'Bb3':233.1,'C4':261.6,'D4':293.7,'Eb4':311.1,'F4':349.2,'G4':392,'A4':440,'Bb4':466.2,'D2':73.4,'A1':55,'Bb1':58.3,'C2':65.4,'F2':87.3}

def track_hype(bpm=140,bars=8):     # Matchday / preview: chenda-phonk
    b=60/bpm; L=bars*4*b+1.0; x=np.zeros(int(L*SR))
    for bar in range(bars):
        t0=bar*4*b
        for k in (0,1.5,2.5): place(x,kick()*0.9,t0+k*b)
        for k in (1,3): place(x,clap(),t0+k*b)
        for s in range(16):   # chenda 16ths with accents (thayambaka-ish)
            acc=1.0 if s%4==0 else (0.75 if s%4==2 else 0.45)
            if bar%2 and s in (13,14,15): acc=1.0
            place(x,chenda(230 if s%3 else 300,bright=acc)*acc*0.55,t0+s*b/4)
        for s in range(8): place(x,hat(),t0+s*b/2+b/4)
        if bar%2==0: place(x,bell(N['A4']*2,0.3)*0.6,t0)
        roots=[N['D2'],N['D2'],N['Bb1'],N['C2']]
        place(x,bass808(roots[bar%4],4*b*0.95),t0)
        if bar>=2:
            mel=[('D4',0,1),('F4',1,.5),('G4',1.5,.5),('A4',2,1),('Bb4',3,.5),('A4',3.5,.5)] if bar%2==0 else \
                [('G4',0,.75),('F4',.75,.25),('Eb4',1,1),('D4',2,1.5),('C4',3.5,.5)]
            for nm,st,du in mel: place(x,lead(N[nm],du*b),t0+st*b)
    return norm(x)

def track_win(bpm=150,bars=6):      # Win: brighter, major lift
    b=60/bpm; L=bars*4*b+1.2; x=np.zeros(int(L*SR))
    M={'D4':293.7,'F#4':370,'A4':440,'B4':493.9,'D5':587.3,'E5':659.3,'G4':392}
    for bar in range(bars):
        t0=bar*4*b
        for k in range(4): place(x,kick()*0.9,t0+k*b)
        for k in (1,3): place(x,clap()*1.1,t0+k*b)
        for s in range(16): place(x,chenda(260,bright=0.9 if s%2==0 else 0.4)*(0.6 if s%4==0 else 0.35),t0+s*b/4)
        place(x,bass808([73.4,98,110,73.4][bar%4],4*b*0.9),t0)
        mel=[('D5',0,.5),('A4',.5,.5),('B4',1,.5),('D5',1.5,.5),('E5',2,1),('D5',3,1)] if bar%2==0 else \
            [('B4',0,.5),('A4',.5,.5),('F#4',1,1),('G4',2,.5),('A4',2.5,1.5)]
        for nm,st,du in mel: place(x,lead(M[nm],du*b)*1.1,t0+st*b)
        place(x,bell(M['D5']*2,0.4)*0.5,t0)
    return norm(x)

def track_sad(bpm=78,bars=4):       # Loss: slow, soft
    b=60/bpm; L=bars*4*b+1.5; x=np.zeros(int(L*SR))
    chords=[('D3','F3','A3'),('Bb3','D4','F4'),('G3','Bb3','D4'),('A3','C4','Eb4')]
    for bar in range(bars):
        t0=bar*4*b
        for nm in chords[bar]:
            n=int(4*b*SR); t=np.arange(n)/SR; f=N[nm]
            pad=(np.sin(2*np.pi*f*t)+0.3*np.sin(2*np.pi*2*f*t))*np.minimum(1,t/0.6)*np.exp(-t/6)*0.12
            place(x,pad,t0)
        place(x,kick(0.5)*0.35,t0); place(x,chenda(180,0.25,0.2)*0.3,t0+2*b)
        place(x,lead(N[chords[bar][2]]*2,2*b)*0.5,t0+b)
    return norm(x,0.8)

save('appu27_matchday_hype.wav',track_hype())
save('appu27_win_celebration.wav',track_win())
save('appu27_heartbreak.wav',track_sad())
print('ok')
