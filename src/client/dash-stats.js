/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import register from "preact-custom-element";

import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

function RfPlotBar({ dataJsonSelector = "", dataJsonField = "", dataDays = "0" }) {
    const containerRef = useRef();
    const [data, setData] = useState();
    let days = 0;
    try {
        days = Number.parseInt(dataDays, 10);
    } catch (e) {
        console.error("invalid days passed to <rf-plot-bar>", e);
    }

    useEffect(() => {
        if (!dataJsonSelector) {
            return;
        }
        const jsonStr = document.querySelector(dataJsonSelector).text;
        const dataJson = JSON.parse(jsonStr);
        setData(!!dataJsonField ? dataJson[dataJsonField] : dataJson);
    }, []);

    useEffect(() => {
        if (data === undefined) return;

        const hasMoreThan1k = !!data.find(d => d.totalVisits > 1000);
        /** @type Plot.ScaleOptions */
        let yOptions = {
            grid: true,
            label: "Total Visits",
        }
        if (hasMoreThan1k) {
            yOptions = {
                ...yOptions,
                label: "Total Visits (sqrt)",
                type: "sqrt",
                domain: [0, 1000],
                clamp: true,
                ticks: 5,
            };
        }

        /** @type Plot.ScaleOptions */
        let xOptions = {
            label: "Date UTC (1h)",
            type: "utc",
        };

        let finalData = data;
        let xInterval = "hour";
        if (days > 0) {
            const tsCutoff = Date.now() - (days * 25 * 60 * 60 * 1000);
            xOptions.domain = [tsCutoff, Date.now()];

            if (days > 31) {
                xInterval = "7 days";
                finalData = Array.from(
                    d3.group(data, d => {
                        const weekMs = 7*24*60*60*1000;
                        return Math.floor(d.tsHourMs / (weekMs)) * (weekMs);
                    }),
                    ([key, entries]) => ({
                        ...entries[0],
                        tsHourMs: key,
                        totalVisits: d3.sum(entries, d => d.totalVisits)
                    })
                );
            } else if (days > 7) {
                xInterval = "day";
                finalData = Array.from(
                    d3.group(data, d => {
                        const dayMs = 24*60*60*1000;
                        return Math.floor(d.tsHourMs / (dayMs)) * (dayMs);
                    }),
                    ([key, entries]) => ({
                        ...entries[0],
                        tsHourMs: key,
                        totalVisits: d3.sum(entries, d => d.totalVisits)
                    })
                );
            }
        }

        const plot = Plot.plot({
            height: 200,
            // Default is 640. The plot will not exceed the parent container width so it's OK if the 
            // number specified here is bigger than available space. The difference is text legibility.
            // TODO Get the parent width.
            width: Math.min(1600, Math.floor(window.innerWidth)),
            y: yOptions,
            x: {...xOptions, interval: xInterval},
            marginBottom: 40,
            marks: [
                // Make the zero-line bold.
                Plot.ruleY([0]),
                Plot.rectY(finalData, { x: "tsHourMs", y: "totalVisits", r: 2, fill: "var(--pico-primary)", interval: xInterval}),
                Plot.tip(finalData, Plot.pointerX({x: "tsHourMs", y: "totalVisits", fontSize: 16 })),
                Plot.crosshair(finalData, {x: "tsHourMs", y: "totalVisits"}),
            ]
        });

        containerRef.current.append(plot);
        return () => plot.remove();
    }, [data]);

    return <div ref={containerRef} />;
}
register(RfPlotBar, "rf-plot-bar", ["data-json-selector", "data-json-field", "data-days"], { shadow: false });
