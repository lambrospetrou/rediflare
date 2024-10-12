/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import register from "preact-custom-element";

import * as Plot from "@observablehq/plot";

function RfPlotBar({ dataJsonSelector = "", dataJsonField = "" }) {
    const containerRef = useRef();
    const [data, setData] = useState();

    useEffect(() => {
        if (!dataJsonSelector || !dataJsonField) {
            return;
        }
        const jsonStr = document.querySelector(dataJsonSelector).text;
        const dataJson = JSON.parse(jsonStr);
        setData(dataJson[dataJsonField]);
    }, []);

    useEffect(() => {
        if (data === undefined) return;

        const hasMoreThan1k = !!data.find(d => d.totalVisits > 1000);
        let yOptions = {
            grid: true,
            label: "Total Visits",
        }
        if (hasMoreThan1k) {
            yOptions = {...yOptions, ...{
                label: "Total Visits (sqrt)",
                type: "sqrt",
                domain: [0, 1000],
                clamp: true,
                ticks: 3    
            }}
        }

        const plot = Plot.plot({
            height: 200,
            y: yOptions,
            x: { label: "Date UTC (1h)", type: "utc" },
            marks: [
                // Make the zero-line bold.
                Plot.ruleY([0]),
                Plot.rectY(data, { x: "tsHourMs", y: "totalVisits", r: 2, fill: "var(--pico-primary)", interval: "hour" }),
                Plot.tip(data, Plot.pointerX({x: "tsHourMs", y: "totalVisits" })),
                Plot.crosshair(data, {x: "tsHourMs", y: "totalVisits"}),
            ]
        });

        containerRef.current.append(plot);
        return () => plot.remove();
    }, [data]);

    return <div ref={containerRef} />;
}
register(RfPlotBar, "rf-plot-bar", ["data-json-selector", "data-json-field"], { shadow: false });
