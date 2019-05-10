///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import _ from 'lodash';
import IrondbQuery from './irondb_query';
import {SegmentType} from './irondb_query';
import {QueryCtrl} from 'app/plugins/sdk';
import './css/query_editor.css!';

function tagless_name(name) {
  var tag_start = name.indexOf("ST[");
  if (tag_start != -1) {
    name = name.substring(0, tag_start - 1);
  }
  return name;
}

function isEven(x) {
  return x % 2 == 0;
}

export class IrondbQueryCtrl extends QueryCtrl {
  static templateUrl = 'partials/query.editor.html';

  defaults = {
  };
  queryModel: IrondbQuery;
  pointTypeOptions = [ { value: "Metric", text: "Metric" }, { value: "CAQL", text: "CAQL" } ];
  egressTypeOptions = [ { value: "default", text: "default" },
                        { value: "count", text: "count" },
                        { value: "average", text: "average" },
                        { value: "average_stddev", text: "average_stddev" },
                        { value: "derive", text: "derive" },
                        { value: "derive_stddev", text: "derive_stddev" },
                        { value: "counter", text: "counter" },
                        { value: "counter_stddev", text: "counter_stddev" } ];
  segments: any[];
  loadSegments: boolean;

  /** @ngInject **/
  constructor($scope, $injector, private uiSegmentSrv, private templateSrv) {
    super($scope, $injector);

    _.defaultsDeep(this.target, this.defaults);
    this.target.isCaql = this.target.isCaql || false;
    this.target.egressoverride = this.target.egressoverride || "default";
    this.target.pointtype = this.target.isCaql ? "CAQL" : "Metric";
    this.target.query = this.target.query || '';
    this.target.segments = this.target.segments || [];
    this.queryModel = new IrondbQuery(this.datasource, this.target, templateSrv);
    this.buildSegments();
    this.loadSegments = false;
  }

  typeValueChanged() {
    this.target.isCaql = (this.target.pointtype == "CAQL");
    this.error = null;
    this.panelCtrl.refresh();
  }

  egressValueChanged() {
    this.panelCtrl.refresh();
  }

  onChangeInternal() {
    this.panelCtrl.refresh(); // Asks the panel to refresh data.
  }

  getCollapsedText() {
    return this.target.query;
  }

  getSegments(index, prefix) {
    console.log("getSegments() " + index + " " + prefix);
    var query = prefix && prefix.length > 0 ? prefix : '';

    var segmentType = this.segments[index]._type;
    console.log("getSegments() " + index + " " + SegmentType[segmentType]);
    if (segmentType === SegmentType.MetricName) {
      return this.datasource
        .metricFindQuery("and(__name:*)")
        .then( results => {
          var metricnames = _.map(results.data, result => {
            return tagless_name(result.metric_name);
          });
          metricnames = _.uniq(metricnames);
          console.log(JSON.stringify(metricnames));

          var allSegments = _.map(metricnames, segment => {
            //var queryRegExp = new RegExp(this.escapeRegExp(query), 'i');

            return this.uiSegmentSrv.newSegment({
              value: segment, //.replace(queryRegExp,''),
              expandable: true//!segment.leaf,
            });
          });

          /*if (index > 0 && allSegments.length === 0) {
            return allSegments;
          }*/

          // add query references
          if (index === 0) {
            _.eachRight(this.panelCtrl.panel.targets, target => {
              if (target.refId === this.queryModel.target.refId) {
                return;
              }
            });
          }

          return allSegments;
        })
        .catch(err => {
          console.log("getSegments() " + err.toString());
          return [];
        });
    }
    else if (segmentType === SegmentType.TagCat || segmentType === SegmentType.TagPlus) {
      var metricName = this.segments[0].value;
      console.log("getSegments() tags for " + metricName);
      return this.datasource
        .metricTagCatsQuery(metricName)
        .then(segments => {
          if (segments.data && segments.data.length > 0) {
            var tagCats = segments.data;
            var tagSegments = [];
            for(var tagCat of tagCats) {
              tagSegments.push(this.uiSegmentSrv.newSegment({
                value: tagCat,
                expandable: true
              }));
            }
            if( segmentType === SegmentType.TagPlus ) {
                // For Plus, we want to allow new operators, so put those on the front
                tagSegments.unshift( this.uiSegmentSrv.newSegment({ type: SegmentType.TagOp, value: "and(" }) );
                tagSegments.unshift( this.uiSegmentSrv.newSegment({ type: SegmentType.TagOp, value: "not(" }) );
                tagSegments.unshift( this.uiSegmentSrv.newSegment({ type: SegmentType.TagOp, value: "or("  }) );
            }
            return tagSegments;
          }
        })
        .catch(err => {
          console.log(err);
          return [];
        });
    }
    else if (segmentType === SegmentType.TagOp) {
        var tagSegments = [
            this.uiSegmentSrv.newSegment({ type: SegmentType.TagOp, value: "REMOVE" }),
            this.uiSegmentSrv.newSegment({ type: SegmentType.TagOp, value: "and(" }),
            this.uiSegmentSrv.newSegment({ type: SegmentType.TagOp, value: "not(" }),
            this.uiSegmentSrv.newSegment({ type: SegmentType.TagOp, value: "or("  })
        ];
        return Promise.resolve(tagSegments);
    }
    else if (segmentType === SegmentType.TagVal) {
      var metricName = this.segments[0].value;
      var tagCat = this.segments[index - 2].value;
      console.log("getSegments() tag vals for " + metricName + ", " + tagCat);
      return this.datasource
        .metricTagValsQuery(metricName, tagCat)
        .then(segments => {
          if (segments.data && segments.data.length > 0) {
            var tagVals = segments.data;
            var tagSegments = [];
            tagSegments.push(this.uiSegmentSrv.newSegment({
              value: '*',
              expandable: true
            }));
            for(var tagVal of tagVals) {
              tagSegments.push(this.uiSegmentSrv.newSegment({
                value: tagVal,
                expandable: true
              }));
            }
            return tagSegments;
          }
        })
        .catch(err => {
          console.log(err);
          return [];
        });
    }
    return Promise.resolve([]);
  }

  parseTarget() {
    this.queryModel.parseTarget();
    this.buildSegments();
  }

  mapSegment(segment) {
    var uiSegment;
    if (segment.type === SegmentType.TagOp) {
      uiSegment = this.uiSegmentSrv.newOperator(segment.value);
    }
    else if (segment.type === SegmentType.TagEnd) {
      uiSegment = this.uiSegmentSrv.newOperator(")");
      uiSegment.isLabel = true;
    }
    else if (segment.type === SegmentType.TagPair) {
      uiSegment = this.uiSegmentSrv.newCondition(":");
      uiSegment.isLabel = true;
    }
    else if (segment.type === SegmentType.TagSep) {
      uiSegment = this.uiSegmentSrv.newCondition(",");
      uiSegment.isLabel = true;
    }
    else {
      uiSegment = this.uiSegmentSrv.newSegment(segment);
    }
    uiSegment._type = segment.type;
    return uiSegment;
  }

  buildSegments() {
    this.segments = _.map(this.queryModel.segments, (s) => this.mapSegment(s));

    let checkOtherSegmentsIndex = this.queryModel.checkOtherSegmentsIndex || 0;
    this.checkOtherSegments(checkOtherSegmentsIndex);
  }

  addSelectMetricSegment() {
    this.queryModel.addSelectMetricSegment();
    var segment = this.uiSegmentSrv.newSelectMetric();
    segment._type = SegmentType.MetricName;
    this.segments.push(segment);
  }

  buildSelectTagPlusSegment() {
    //this.queryModel.addSelectMetricSegment();
    var tagCatSegment = this.uiSegmentSrv.newPlusButton();
    tagCatSegment.html += ' tag';
    tagCatSegment._type = SegmentType.TagPlus;
    return tagCatSegment;
  }

  addSelectTagPlusSegment() {
    this.segments.push(this.buildSelectTagPlusSegment());
  }

  newSelectTagValSegment() {
    var tagValSegment = this.uiSegmentSrv.newKeyValue("*");
    tagValSegment._type = SegmentType.TagVal;
    return tagValSegment;
  }

  checkOtherSegments(fromIndex) {
    console.log("checkOtherSegments() " + fromIndex + " " + this.segments.length);
    if (fromIndex === this.segments.length) {
      var segmentType = this.segments[fromIndex - 1]._type;
      console.log("checkOtherSegments() " + (fromIndex - 1) + " " + SegmentType[segmentType]);
      if (segmentType === SegmentType.MetricName) {
        this.addSelectTagPlusSegment();
      }
      else if (segmentType === SegmentType.TagCat) {
        if (this.segments[fromIndex - 2]._type === SegmentType.TagVal) {
          this.segments.splice(this.segments.length - 1, 0, this.mapSegment({ type: SegmentType.TagSep }));
        }
        else if( fromIndex == 2 ) {
          // if fromIndex is to, and we're a tagCat, it means we need to add in the implicit and() in the front
          this.segments.splice(this.segments.length - 1, 0, this.mapSegment({ type: SegmentType.TagOp, value: "and(" }));
        }
        this.segments.push(this.mapSegment({ type: SegmentType.TagPair }),
            this.newSelectTagValSegment()
        );
        this.addSelectTagPlusSegment();
        this.segments.push(this.mapSegment({ type: SegmentType.TagEnd }));
      }
      else if (segmentType === SegmentType.TagVal) {
        this.addSelectTagPlusSegment();
        this.segments.push(this.mapSegment({ type: SegmentType.TagEnd }));
      }
    }
    else {
      var lastSegment = this.segments[this.segments.length - 1];
      if (lastSegment._type === SegmentType.TagEnd) {
        this.segments.splice(this.segments.length - 1, 0, this.buildSelectTagPlusSegment());
      }
      else {
        this.addSelectTagPlusSegment();
      }
    }
    return Promise.resolve();
  }

  setSegmentFocus(segmentIndex) {
    _.each(this.segments, (segment, index) => {
      segment.focus = segmentIndex === index;
    });
  }

  segmentValueChanged(segment, segmentIndex) {
    console.log("segmentValueChanged()");
    this.error = null;
    this.queryModel.updateSegmentValue(segment, segmentIndex);

    if( segment._type === SegmentType.TagOp ) {
        if( segment.value === "REMOVE" ) {
            // We need to remove ourself, as well as every other segment until our TagEnd
            // For every TagOp we hit, we need to get one more TagEnd to remove any sub-ops
            var endIndex = segmentIndex + 1;
            var endsNeeded = 1;
            var lastIndex = this.segments.length;
            while( endsNeeded > 0 && endIndex < lastIndex) {
                var type = this.segments[endIndex]._type;
                if( type === SegmentType.TagOp ) {
                    endsNeeded++;
                } else if( type === SegmentType.TagEnd ) {
                    endsNeeded--;
                    break; 
                }
                endIndex++; // keep going
            }
            // everything after my tagEnd
            var tail = this.segments.splice( endIndex + 1, 0 );
            // everything up until me
            var head = this.segments.splice( 0, segmentIndex );
            var optionalPlus = [];
            if( lastIndex === endIndex + 1 ) { 
                // If these match, we removed the outermost operator, so we need a new + button
                optionalPlus.push( this.buildSelectTagPlusSegment() );
            }
            this.segments = head.concat( tail, optionalPlus );
        }
        // else Changing an Operator doesn't need to affect any other segments
        this.targetChanged();
        return;
    }
    else if( segment._type === SegmentType.TagPlus ) {
        if( segment.value === "and(" ||
            segment.value === "not(" ||
            segment.value === "or(" )
        {
            // Remove myself
            this.segments.splice(segmentIndex, 1);
            if( segmentIndex > 2 ) {
                this.segments.splice(segmentIndex, 0, this.mapSegment({ type: SegmentType.TagSep }));
            }
            // and replace it with a TagOp + friends
            this.segments.splice(segmentIndex + 1, 0,
                this.mapSegment({ type: SegmentType.TagOp, value: segment.value }),
                this.mapSegment({ type: SegmentType.TagCat, value: "undefined" }),
                this.mapSegment({ type: SegmentType.TagPair }),
                this.newSelectTagValSegment(),
                this.buildSelectTagPlusSegment(),
                this.mapSegment({ type: SegmentType.TagEnd })
             );
             if( segmentIndex > 2 ) {
                 this.segments.splice(segmentIndex + 7, 0, this.buildSelectTagPlusSegment() );
             }
             // Do not trigger targetChanged().  We do not have a valid category, which we need, so set focus on it
             this.setSegmentFocus(segmentIndex + 3);
             return;
        } else {
            segment._type = SegmentType.TagCat;
        }
    }

    this.spliceSegments(segmentIndex + 1);
    if (segment.expandable) {
      return this.checkOtherSegments(segmentIndex + 1).then(() => {
        this.setSegmentFocus(segmentIndex + 1);
        this.targetChanged();
      });
    } else {
      this.spliceSegments(segmentIndex + 1);
    }

    this.setSegmentFocus(segmentIndex + 1);
    this.targetChanged();
  }

  spliceSegments(index) {
    this.segments = this.segments.splice(0, index);
    this.queryModel.segments = this.queryModel.segments.splice(0, index);
  }

  emptySegments() {
    this.queryModel.segments = [];
    this.segments = [];
  }

  segmentsToStreamTags() {
    var segments = this.segments.slice();
    // First element is always metric name
    var metricName = segments.shift().value;
    var query = "and(__name:" + metricName;
    var noComma = false; // because last was a tag:pair
    for ( let segment of segments ) {
        let type = segment._type;
        if( type === SegmentType.TagPlus ) {
            continue;
        }
        if( !noComma && type !== SegmentType.TagEnd && type !==SegmentType.TagSep ) {
            query += ","
        }
        if( type === SegmentType.TagOp || type === SegmentType.TagPair || type === SegmentType.TagCat || type === SegmentType.TagSep ) { 
            noComma = true; 
        } else { 
            noComma = false; 
        }

        query += segment.value;
    }
    query += ")";
    console.log("QUERY: " + query);
    return query;
  }

  updateModelTarget() {
    var streamTags = this.segmentsToStreamTags();
    console.log("updateModelTarget() " + streamTags);
    this.queryModel.updateModelTarget(this.panelCtrl.panel.targets);
    this.queryModel.target.query = streamTags;
  }

  targetChanged() {
    console.log("targetChanged()");
    if (this.queryModel.error) {
      return;
    }

    var oldTarget = this.queryModel.target.query;
    this.updateModelTarget();

    if (this.queryModel.target !== oldTarget) {
      this.panelCtrl.refresh();
    }
  }

  showDelimiter(index) {
    return index !== this.segments.length - 1;
  }

  escapeRegExp(regexp) {
    var specialChars = "[]{}()*?.,";
    var fixedRegExp = [];
    for (var i = 0; i < regexp.length; ++i) {
      var c = regexp.charAt(i);
      switch (c) {
        case '?':
          fixedRegExp.push(".");
          break;
        case '*':
          fixedRegExp.push(".*?");
          break;
        default:
          if (specialChars.indexOf(c) >= 0) {
            fixedRegExp.push("\\");
          }
          fixedRegExp.push(c);
      }
    }
    return fixedRegExp.join('');
  }
}

function mapToDropdownOptions(results) {
  return _.map(results, value => {
    return { text: value, value: value };
  });
}
