/** @jsx h */
/** @jsxFrag Fragment */
import {h, Fragment} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import register from "preact-custom-element";

import * as Plot from "@observablehq/plot";
// import * as d3 from "d3";

function RfPlotBar({dataSelector = ""}) {
    const containerRef = useRef();
  const [data, setData] = useState();

  useEffect(() => {
    // d3.csv("/-_-/ui/static/Get-Fit-History-Daily-overview.csv", d3.autoType).then(setData);
    const jsonStr = document.querySelector(dataSelector).text;
    const dataJson = JSON.parse(jsonStr);
    setData(dataJson);
  }, []);

  useEffect(() => {
    if (data === undefined) return;
    const plot = Plot.plot({
      y: {grid: true},
      color: {scheme: "burd"},
      marks: [
        Plot.ruleY([0]),
        Plot.dot(data, {x: "tsHourMs", y: "totalVisits", stroke: "ruleUrl"})
      ]
    });
    containerRef.current.append(plot);
    return () => plot.remove();
  }, [data]);

  return <div ref={containerRef} />;
}
register(RfPlotBar, "rf-plot-bar", ["data-selector"], { shadow: false });
