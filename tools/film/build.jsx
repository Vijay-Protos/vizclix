// Builds the sections 1-5 film for VizClix in After Effects, then render with aerender.
// 1. Put the source clips in ROOT/footage/: Mixkit 41375 (dusk horizon), 42041 (night city from
//    above), 42342 (blue-hour towers), each as <id>.mp4 at 1080p, plus mahavir-springs-thane.jpg.
// 2. Set ROOT below, run this file in AE (File > Scripts > Run Script File, with "Allow Scripts to
//    Write Files and Access Network" on), then: aerender -project ROOT/flight.aep
// 3. python3 tools/film/frames.py ROOT/plate assets/film   (needs Pillow)
// To swap in Polycrayons' own renders, replace the files in footage/ and keep the timings.
// VizClix sections 1-5: one continuous night shot for scroll scrubbing.
// Dusk horizon -> night city from above -> blue-hour approach through towers -> the property.
var ROOT = "/path/to/film-work"; // <- set this
(function () {
  var log = new File(ROOT + "/build.log"); log.open("w");
  try {
    app.beginSuppressDialogs();
    var proj = app.newProject();
    var W = 1600, H = 900, FPS = 12, D = 15.25;
    var comp = proj.items.addComp("flight", W, H, 1, D, FPS);
    function imp(name) { return proj.importFile(new ImportOptions(new File(ROOT + "/footage/" + name))); }
    function cover(layer, item, extra) {          // scale so the source covers the frame
      var s = Math.max(W / item.width, H / item.height) * 100 * (extra || 1);
      return s;
    }
    // shot: item, comp in, comp out, source start, scale from/to (x cover), rotation from/to, y drift
    function shot(item, tin, tout, src, s0, s1, r0, r1, y0, y1) {
      var L = comp.layers.add(item);
      L.startTime = tin - src;
      L.inPoint = tin; L.outPoint = tout;
      var base = cover(L, item, 1);
      var sc = L.property("Scale");
      sc.setValueAtTime(tin, [base * s0, base * s0]); sc.setValueAtTime(tout, [base * s1, base * s1]);
      var rot = L.property("Rotation"); rot.setValueAtTime(tin, r0); rot.setValueAtTime(tout, r1);
      var pos = L.property("Position"); pos.setValueAtTime(tin, [W / 2, H / 2 + y0]); pos.setValueAtTime(tout, [W / 2, H / 2 + y1]);
      return L;
    }
    function fadeIn(L, t, d) { var o = L.property("Opacity"); o.setValueAtTime(t, 0); o.setValueAtTime(t + d, 100); }
    var dusk = imp("41375.mp4"), grid = imp("42041.mp4"), towers = imp("42342.mp4"), prop = imp("mahavir-springs-thane.jpg");
    // bottom to top: later shots sit above and fade in over the one before
    var L1 = shot(dusk, 0, 4.75, 2.0, 1.04, 1.16, 0, 0, 0, 0);
    L1.property("ADBE Effect Parade").addProperty("ADBE Exposure2").property("Exposure").setValue(1.25);
    var L2 = shot(grid, 4.0, 8.5, 0.5, 1.05, 1.14, -2, 3, 0, 0); fadeIn(L2, 4.0, 0.75);
    var L3 = shot(towers, 7.75, D, 0.0, 1.04, 1.16, 0, 0, 0, 0); fadeIn(L3, 7.75, 0.75);
    var dim = comp.layers.addSolid([0.02, 0.025, 0.04], "dim", W, H, 1); dim.inPoint = 11.5; dim.outPoint = D;
    var dimO = dim.property("Opacity"); dimO.setValueAtTime(11.5, 0); dimO.setValueAtTime(12.4, 58);
    // the property: the whole render, framed like the shot being taken, right of the copy
    var L4 = comp.layers.add(prop); L4.inPoint = 11.5; L4.outPoint = D;
    var fit = H * 0.7 / prop.height * 100, cx4 = W * 0.68;
    var s4 = L4.property("Scale"); s4.setValueAtTime(11.5, [fit * 0.97, fit * 0.97]); s4.setValueAtTime(D, [fit * 1.03, fit * 1.03]);
    L4.property("Position").setValue([cx4, H / 2]);
    fadeIn(L4, 11.9, 0.7);
    // viewfinder corners around it, the logo's own mark, in ember
    var bw = prop.width * fit / 100 * 1.03 + 36, bh = prop.height * fit / 100 * 1.03 + 36, arm = 34;
    var B = comp.layers.addShape(); B.name = "viewfinder"; B.inPoint = 12.3; B.outPoint = D;
    var grp = B.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var vec = grp.property("ADBE Vectors Group");
    var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (var c = 0; c < 4; c++) {
      var sx = corners[c][0], sy = corners[c][1], px = cx4 + sx * bw / 2, py = H / 2 + sy * bh / 2;
      var pth = vec.addProperty("ADBE Vector Shape - Group"), shp = new Shape();
      shp.vertices = [[px - sx * arm, py], [px, py], [px, py - sy * arm]]; shp.closed = false;
      pth.property("ADBE Vector Shape").setValue(shp);
    }
    var st = vec.addProperty("ADBE Vector Graphic - Stroke");
    st.property("ADBE Vector Stroke Color").setValue([1, 0.42, 0.21]); st.property("ADBE Vector Stroke Width").setValue(3);
    var bs = B.property("Scale"); bs.setValueAtTime(12.3, [112, 112]); bs.setValueAtTime(12.75, [100, 100]);
    B.property("Anchor Point").setValue([cx4, H / 2]); B.property("Position").setValue([cx4, H / 2]);
    var bo = B.property("Opacity"); bo.setValueAtTime(12.3, 0); bo.setValueAtTime(12.55, 100);
    // fog banks over each cut, as if the drone flies through cloud
    function fog(tmid) {
      var F = comp.layers.addSolid([0, 0, 0], "fog", W, H, 1);
      F.inPoint = tmid - 0.9; F.outPoint = tmid + 0.9;
      var fx = F.property("ADBE Effect Parade").addProperty("ADBE Fractal Noise");
      fx.property("Contrast").setValue(95); fx.property("Brightness").setValue(-16); fx.property("Complexity").setValue(4);
      function fxp(name) { for (var i = 1; i <= fx.numProperties; i++) if (fx.property(i).name === name) return fx.property(i); return null; }
      fxp("Scale").setValue(520);
      var off = fxp("Offset Turbulence");
      off.setValueAtTime(tmid - 0.9, [W / 2, H * 0.9]); off.setValueAtTime(tmid + 0.9, [W / 2, H * 0.1]);
      var ev = fx.property("Evolution"); ev.setValueAtTime(tmid - 0.9, 0); ev.setValueAtTime(tmid + 0.9, 220);
      var tint = F.property("ADBE Effect Parade").addProperty("ADBE Tint");
      tint.property(1).setValue([0.04, 0.06, 0.1]); tint.property(2).setValue([0.62, 0.66, 0.74]);
      F.blendingMode = BlendingMode.SCREEN;
      var o = F.property("Opacity");
      o.setValueAtTime(tmid - 0.9, 0); o.setValueAtTime(tmid - 0.1, 78); o.setValueAtTime(tmid + 0.15, 78); o.setValueAtTime(tmid + 0.9, 0);
    }
    fog(4.375); fog(8.125); fog(11.875);
    // one grade over everything: navy shadows, dusk-blue mids, warm window highlights
    var G = comp.layers.addSolid([1, 1, 1], "grade", W, H, 1); G.adjustmentLayer = true;
    var tri = G.property("ADBE Effect Parade").addProperty("ADBE Tritone");
    tri.property("Highlights").setValue([1, 0.82, 0.64]);
    tri.property("Midtones").setValue([0.17, 0.22, 0.32]);
    tri.property("Shadows").setValue([0.025, 0.035, 0.06]);
    tri.property("Blend With Original").setValue(55);
    // vignette: a dark frame edge, so text on the left reads and the eye goes to the middle
    var V = comp.layers.addSolid([0.02, 0.025, 0.04], "vignette", W, H, 1);
    var m = V.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var sh = new Shape(); var k = 0.5523, rx = W * 0.62, ry = H * 0.72, cx = W / 2, cy = H / 2;
    sh.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
    sh.inTangents = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
    sh.outTangents = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]];
    sh.closed = true;
    m.property("ADBE Mask Shape").setValue(sh); m.inverted = true;
    m.property("ADBE Mask Feather").setValue([420, 420]);
    V.property("Opacity").setValue(62);
    var rq = proj.renderQueue.items.add(comp);
    var om = rq.outputModule(1), t = om.templates;
    for (var i = 0; i < t.length; i++) if (/TIFF/i.test(t[i])) { om.applyTemplate(t[i]); break; }
    om.file = new File(ROOT + "/plate/f_[#####]");
    proj.save(new File(ROOT + "/flight.aep"));
    log.write("ok layers=" + comp.numLayers + " frames=" + Math.round(D * FPS));
  } catch (e) { log.write("ERR line " + e.line + ": " + e.toString()); }
  log.close();
})();
