import React from 'react';
import Interactive from 'react-interactive';
import { Switch, Route, Link } from 'react-router-dom';
import PageNotFound from './PageNotFound';

import _ from 'lodash';
import numeral from 'numeral';

import vt1 from '../assets/VT1.csv';
import vt2 from '../assets/VT2.csv';
import vt3 from '../assets/VT3.csv';

import * as d3 from 'd3';
window.d3 = d3;

import '../styles/info-vis.css';

let ssv = d3.dsvFormat(';');

const margin = { top: 30, right: 0, bottom: 30, left: 45 };
const width = 640 - margin.left - margin.right;
const height = 480 - margin.top - margin.bottom;
const gridSize = Math.floor(height / 11);
const legendElementWidth = gridSize * 2;

const colors = {
  'NDA': '#0088c6',
  'MLP': '#83726d',
  'EM': '#ffd850',
  'BH': '#f39dc7',
  'NA': '#a21700',
  'PP': '#f96f43',
  'JC': '#464a4c',
  'JL': '#cee9f8',
  'JLM': '#de2707',
  'FA': '#131413',
  'FF': '#75bbe2',
};
const candidates = _.keys(colors);

const minEval = -.1;
const maxEval = 1;

const nbBins = 22;

function parseSsvData(...files) {
  let rawDataSets = _.map(files, vt => ssv.parse(vt))
  let dataSets = _.chain(rawDataSets)
    .flatMap((data, i) => {
      let _data = _.map(data, item => {
        const _item = {};
        for (const key in item) {
          let val = item[key];
          if (typeof val === 'string') {
            val = val.trim();
          }

          const newKey = key.trim();
          if (val === 'None') {
            _item[newKey] = null;
          } else if (!isNaN(val)) {
            _item[newKey] = Number(val);
          }
        }

        _item.vt = i + 1;
        return _item;
      });
      return _data;
    })
    .value();

  if (rawDataSets.length > 0) {
    dataSets.columns = _.map(rawDataSets[0].columns, col => col.trim());
  }
  return dataSets;
}

/**
 * ref: https://bl.ocks.org/mbostock/4341954
 */
function kernelDensityEstimator(kernel, X) {
  return function(V) {
    return X.map(function(x) {
      return [x, d3.mean(V, function(v) { return kernel(x - v); })];
    });
  };
}

function kernelEpanechnikov(k) {
  return function(v) {
    return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
  };
}

function approvalVsEvalGraph(dataSets, elementId, candidates, approval) {
  const rootEl = d3.select(`#${elementId}`);
  rootEl.selectAll('*').remove();
  const svg = rootEl.append('svg')
    .attr('font-size', '80%')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  const xTicks = _.map(candidates, (c, i) => (width - 100) * i / candidates.length + 50);
  let x = d3.scaleOrdinal().range(xTicks);
  let y = d3.scaleLinear().rangeRound([height, 0]);
  let z = d3.scaleLinear().range([0, 25]);

  x.domain(candidates);
  y.domain([minEval, maxEval]);
  z.domain([0, 1]);

  svg.append('g')
    .attr('transform', `translate(0, ${height * maxEval / (maxEval - minEval)})`)
    .call(d3.axisBottom(x));
  svg.append('g')
    .call(d3.axisLeft(y));


  const chart = svg.append('g');
  candidates.forEach((cand, i) => {
    const series = dataSets.filter(item => item[`AV_${cand}`] === approval).map(item => item[`EV_${cand}`] || 0);

    const bins = d3.histogram()
      .domain(y.domain())
      .thresholds(y.ticks(nbBins)) (series);

    const maxCount = d3.max(bins, bin => bin.length);

    const density = kernelDensityEstimator(kernelEpanechnikov(.1), y.ticks(nbBins))(series);
    let maxDensity = d3.max(density, pair => pair[1]);

    const z0 = d3.scaleLinear().range([0, 25])
      .domain([0, maxDensity]);
    density.splice(0, 0, [minEval, 0]);
    density.splice(density.length, 0, [maxEval, 0]);

    const color = d3.hsl(colors[cand]);
    color.opacity = .75;

    chart.append('path')
      .datum(density)
      .attr('fill', color)
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .attr('stroke-linejoin', 'round')
      .attr('d',
        d3.line()
          .curve(d3.curveBasis)
          .x(d => x(cand) - z0(d[1]))
          .y(d => y(d[0]))
      );

    chart.append('path')
      .datum(density)
      .attr('fill', color)
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .attr('stroke-linejoin', 'round')
      .attr('d',
        d3.line()
          .curve(d3.curveBasis)
          .x(d => x(cand) + z0(d[1]))
          .y(d => y(d[0]))
      );
  });
}

class InfoVisApEvalComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      candidates,
      approval: 1
    };
  }

  componentDidMount() {
    this.dataSets = parseSsvData(vt1, vt2, vt3);
    approvalVsEvalGraph(this.dataSets, 'approval-vs-eval-container', this.state.candidates, this.state.approval);
  }

  componentDidUpdate() {
    approvalVsEvalGraph(this.dataSets, 'approval-vs-eval-container', this.state.candidates, this.state.approval);
  }

  handleCandidatesChange(cand, e) {
    const _candidates = this.state.candidates;
    const newCandidates = _candidates.indexOf(cand) >= 0
      ? _.filter(_candidates, _cand => _cand !== cand)
      : _candidates.concat([cand]);

    this.setState({candidates: _.intersection(candidates, newCandidates)});
  }

  handleApprovalChange(val, e) {
    this.setState({approval: val});
  }

  render() {
    const _candidates = this.state.candidates;
    const _approval = Number(this.state.approval);

    return (
      <section>
        <h1>Information Visualization Demo</h1>
        <div id="approval-vs-eval-container" className="graph-container" />

        <form id="approval-vs-eval-filter">
          <div className="form-block">
            <label>Candidates</label>
            <p>
              {_.map(candidates, cand =>
                <label key={`label-${cand}`}>
                  <input type="checkbox" name="cand" value={cand}
                    checked={_candidates.indexOf(cand) >= 0} onChange={this.handleCandidatesChange.bind(this, cand)} />
                  {' '}
                  {cand}
                </label>
              )}
            </p>
          </div>

          <div className="form-block">
            <label>Approval</label>
            <p>
              <label><input type="radio" name="ap" value={1}
                checked={_approval === 1} onChange={this.handleApprovalChange.bind(this, 1)} /> Yes</label>
              <label><input type="radio" name="ap" value={0}
                checked={_approval !== 1} onChange={this.handleApprovalChange.bind(this, 0)} /> No</label>
            </p>
          </div>
        </form>
      </section>
    );
  }
}

export default InfoVisApEvalComponent;
