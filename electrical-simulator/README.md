# ⚡ ElectroSim – Electrical Control Wiring + PLC Simulator

Ye ek offline simulator hai jo **control wiring, control panel design, power circuits aur PLC ladder logic** ko live simulate karta hai. YouTube tutorials ke liye banaya gaya hai.

## Kaise chalayein (PC par)

1. Poora `electrical-simulator` folder apne PC mein copy karein.
2. `index.html` par **double-click** karein → Chrome / Edge mein khul jayega.
3. Internet ki zarurat nahi hai. Kuch bhi install nahi karna hai.

> Aapka kaam browser mein apne-aap save hota rehta hai (autosave). Permanent copy ke liye **💾 Save** dabakar `.esim.json` file bana lijiye; **📂 Open** se wapas khol sakte hain.

## Basic use

| Kaam | Kaise |
|---|---|
| Part lagana | Left palette se part click karein → sheet par click karein (`R` = rotate, `Esc` = band) |
| Wire banana | Kisi terminal dot par click karein (ya `W` dabayein) → bend ke liye click → doosre terminal/wire par click karke khatam |
| Select / move | Part par click & drag (wires saath mein chalti hain). `Shift`+drag = box select |
| Pan / Zoom | Khali jagah drag = pan, mouse wheel = zoom, `F` = fit to screen |
| Delete / Undo | `Delete`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+C` / `Ctrl+V`, `Ctrl+D` duplicate |
| Simulation | **▶ Run** ya `Space`. Push button ko mouse se dabakar rakhein, switches par click karein |
| Export | **🖼 PNG** / **SVG** – video thumbnails aur notes ke liye drawing export |

### Contacts kaise jodte hain (real drawing jaisa)
Coil, timer aur OLR ka ek **tag** hota hai (jaise `K1`, `KT1`, `F1`). NO/NC contact aur 3-pole main contact mein wahi tag likhiye – contact apne-aap us coil ke saath chalega. Isliye power circuit aur control circuit alag-alag jagah draw kar sakte hain, bilkul real panel drawing ki tarah.

## Components

- **Supply:** 1Φ 230V AC, 3Φ 415V AC (R-Y-B-N), 24V DC SMPS
- **Protection:** MCB 1P / 2P / 3P (rating ke saath), Fuse, Overload Relay (OLR)
- **Switches & Sensors:** Push button NO/NC, Emergency stop (latching), Selector/toggle, 3-position selector (Hand-Off-Auto), Limit switch NO/NC, Float switch, PNP proximity sensor (3-wire)
- **Coils / Timers:** Contactor coil, Auxiliary relay, ON-delay timer, OFF-delay timer (coil voltage 230V AC / 415V AC / 24V DC)
- **Contacts:** NO, NC, Contactor main contacts 3P
- **Loads:** Indicator lamp (6 colours), Buzzer, Solenoid valve, 3Φ motor, 3Φ 6-terminal motor (star-delta), 1Φ motor/fan/pump
- **PLC:** 8 digital inputs (I0.0–I0.7), 6 relay outputs (Q0.0–Q0.5)
- **Misc:** Terminal block, Text label

## Simulation kya-kya dikhata hai

- Wires ka colour phase ke hisaab se: **R** laal, **Y** peela, **B** neela, **N** grey, +24V, 0V; dead wire halka grey
- **Short circuit** detect hota hai → sabse chhoti rating wala MCB/fuse trip/blow hota hai (selectivity)
- **Overload:** simulation mein motor par click = mechanical overload → 3 second mein OLR trip
- **Single phasing** warning, motor **FWD / REV** direction (phase sequence se)
- **STAR / DELTA** connection automatic pehchanta hai (6-terminal motor)
- Coil par galat voltage (jaise 415V on 230V coil) → warning
- Relay chatter / oscillation warning, duplicate tag warning
- Speed control 0.5× – 5× (lambe timers jaldi dikhane ke liye)

## PLC Ladder

**🪜 PLC Ladder** button se neeche ladder editor khulta hai.

- Tools: NO contact `┤ ├`, NC contact `┤/├`, wire, coil `( )`, Set `(S)`, Reset `(R)`, `TON`, `TOF`, `CTU`
- Address box mein address likhiye phir cell par click karein: `I0.0`–`I0.7`, `Q0.0`–`Q0.5`, `M0`…, `T0`…, `C0`…
- Parallel branch (jaise seal-in): `+row` se nayi row, phir `┬ L` (left edge) / `┬ R` (right edge) se row ko upar wali row se jodiye
- Right-click = address/preset edit, **🏷 Symbols** = addresses ke naam (START, STOP…)
- Simulation chalate waqt live **green power flow**, I/O LEDs, timer/counter values dikhte hain

## Ready examples (📂 Examples…)

1. DOL Starter (power + control, run/trip lamps)
2. Forward / Reverse starter with electrical interlock
3. Automatic Star-Delta starter (timer ke saath)
4. PLC Start/Stop with timer (ladder program ke saath)

## Files

```
electrical-simulator/
  index.html        ← isko kholna hai
  css/style.css
  js/components.js  ← saare components (naya component yahan add hota hai)
  js/sim.js         ← simulation engine
  js/ladder.js      ← PLC ladder engine + editor
  js/editor.js      ← drawing editor
  js/examples.js    ← example circuits
```
