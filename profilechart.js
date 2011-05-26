Ext4.require(['Ext4.data.*']);
Ext4.require(['Ext4.chart.*']);
Ext4.require(['Ext4.Window', 'Ext4.fx.target.Sprite', 'Ext4.layout.container.Fit']);

//declare global variables
var win;
var elevationChart;
var currentStoreData=[];
var minElevation;
var maxElevation;

/**
 * function: Ext4.onReady()
 * description: Initiation function for Extjs 4 Sandbox. It gets called when page is ready
 */
Ext4.onReady( function () {

	/**
	 * function: generateElevationDataFromResults(Array results, Number totalLength)
	 * description: Function parses result-array from elevation service and puts result data into return-array.
	 * Return-array acts as data for JSON-Store --> chart-data
	 * parameters:
	 * -    results:    	array returned from elevation-service
	 * -	totalLength:	total length of all path segments
	 * return:  Array data: array for chart-data. Fields: [index, elevation, lat, lon]
	 */
	window.generateElevationDataFromResults = function (results, totalLength) {
		var data = [];
		var gapLength=totalLength/results.length;
		var totalGapLength=0;
		//get max Elevation for marker label placement in chart
		maxElevation=results[0].elevation;
		for (var i = 1; i < results.length; i++) {
			if (results[i].elevation>=maxElevation) {
				maxElevation=results[i].elevation;
			}
		}
		//round it to a hundreder value and add offset. Marker labels must be always visible
		maxElevation=(Math.floor(maxElevation/100)*100)+97;

		for (var i = 0; i < results.length; i++) {

			if (results[i].breakPoint) {

				data.push({
					index: i,
					elevation: results[i].elevation,//elevation can be changed through filter, this is why displayElevation is needed
					displayElevation: results[i].elevation,
					lat: results[i].lat,
					lon: results[i].lon,
					markerElevation:maxElevation,
					direction: results[i].breakPoint.directionString,
					markerNo: String.fromCharCode(results[i].breakPoint.index+65),
					markerIndex: results[i].breakPoint.index,
					xAxisLength:totalGapLength
				});
			} else {
				data.push({
					index: i,
					elevation: results[i].elevation,
					displayElevation: results[i].elevation,
					lat: results[i].lat,
					lon: results[i].lon,
					xAxisLength:totalGapLength
				});
			}
			totalGapLength+=gapLength;
		}
		//save current data to global array
		currentStoreData=cloneArray(data);
		return data;
	};
	//create JsonStore = base data for chart
	window.elevationStore=Ext4.create('Ext4.data.JsonStore', {
		proxy: {
			type: 'localstorage',
			id  : 'localStore'
		},
		fields: ['index','elevation','lat', 'lon','markerElevation','direction','markerNo','markerIndex','xAxisLength','displayElevation']
	});

	//configuration for height multiplicator slider-label
	var sliderLabel= {
		xtype:'label',
		region:'north',
		height:30,
		style: {
			padding:5
		},
		text: 'Height multiplicator:'
	}

	/**
	 * function: createHeightStartValueField(Number min, Number max)
	 * description: configuration function for starting y-value. Minimum and Maximum-value get passed.
	 * function gets called while creating profile window.
	 * parameters:
	 * -    min:    minimum value as number (lowest value from data)
	 * -	max:	maximum value as number (highest value from data)
	 * return:  configuration for y-value numberfield
	 */
	function createHeightStartValueField(min,max) {
		return {
			xtype: 'numberfield',
			id: 'yStartValueTxt',
			fieldLabel: 'Y-Start-Wert',
			labelAlign:'top',
			value: min,
			maxValue: max-50, //abstract 50 to always show region of at least 50m
			minValue: min,
			region:'south',
			height:40,
			disableKeyFilter:true,
			keyNavEnabled: true,
			border:true,
			decimalSeparator:',',
			decimalPrecision:0,
			step:50,
			editable:false,
			listeners: {
				change: {
					fn: function(obj, newVal, oldVal) {
						Ext4.getCmp('chartContainer').removeAll();
						//TODO add slider value for majorTick

						//draw new axis with new min-value
						createElevationChart(parseInt(newVal), maxElevation);
						//filter data, that is smaller than new min value and display it in chart
						elevationStore.loadData(filterDataByMinValue(newVal));
					}
				}
			}

		};
	}

	//TODO handler for slider changes tick size
	//configuration for height multiplicator slider. Slider redraws chart with new majorTickSize
	var heightSlider= {
		id:'heightSlider',
		xtype: 'slider',
		region:'center',
		vertical:true,
		value: 1,
		style: {
			margin:15
		},
		increment: 1,
		minValue: 1,
		maxValue: 10
	}

	/**
	 * function: createElevationChart(Number min, Number max)
	 * description: function creates configuration for elevation-chart and adds it to 'chartContainer' in profile window.
	 * The minimum value and maximum value for y-axis get passed. Function gets called when main profile window gets created
	 * and when yStartValue-numberfield value changes.
	 * parameters:
	 * -    min:    minimum value sets min-value of y-axis in chart.
	 * -	max:	maximum value sets max-value of y-axis in chart.
	 */
	function createElevationChart(min,max) {
		elevationChart= {
			id:'elevationChart',
			xtype: 'chart',
			animate: false,
			store: elevationStore,
			shadow: false,
			theme: 'Blue',
			axes: [{
				type: 'Numeric',
				id:'yValAxis',
				xtype: 'Axis',
				minimum: min,
				maximum: max,
				adjustMinimumByMajorUnit:false,
				decimals:0,
				position: 'left',
				majorTickSteps:9,
				fields: ['elevation'],
				title: 'height in m',
				grid: {
					odd: {
						opacity: 1,
						fill: '#ddd',
						stroke: '#bbb',
						'stroke-width': 0.5
					}
				}
			}
			,{
				type: 'Numeric',
				position: 'bottom',
				fields: ['xAxisLength'],
				title: 'path in km'
			}
			],
			series: [{
				type: 'area',
				highlight:false,
				axis: 'left',
				grid:true,
				smooth: false,
				field:'index',
				style: {
					opacity: 0.7
				},
				xField: 'index',
				yField: 'elevation',
				tips: {
					trackMouse: true,
					width: 150,
					height: 50,
					renderer: function(storeItem, item) {
						//cut digits
						var elevation=Math.floor(storeItem.get('displayElevation'));

						//set number of digits for coordinates
						var digits=7;
						var lat=storeItem.get('lat');
						var lon=storeItem.get('lon');

						// show marker on map
						setMoveableMarker(lat, lon);

						//set digit number, convert to string and replace "." with ","
						lat=(Math.floor(lat*Math.pow(10,digits))/Math.pow(10,digits)+'').replace(".",",");
						lon=(Math.floor(lon*Math.pow(10,digits))/Math.pow(10,digits)+'').replace(".",",");

						//tooltip text
						this.setTitle('Height: ' + elevation + ' m <br> Latitude: '+ lat + '<br> Longitude: '+ lon);
					}
				},
			},{
				type: 'scatter',
				highlight:false,
				axis: 'left',
				markerConfig: {
					type: 'circle',
					radius: 10,
					fill: '#FF0000',
					'stroke-width': 0
				},
				label: {
					display: 'middle',
					field: 'index',
					renderer: function (n) {
						//show marker Char
						//convert via ascii code to char
						return String.fromCharCode(n+65+1)/*+': ' + elevationStore.findRecord('markerIndex',n+1).get('direction')*/;
					},
					'text-anchor': 'middle',
					contrast: false
				},

				xField: 'index',
				yField: 'markerElevation',
				tips: {
					trackMouse: false,
					width: 150,
					height: 60,
					renderer: function(storeItem, item) {
						//cut digits
						var elevation=Math.floor(storeItem.get('displayElevation'));

						//set number of digits for coordinates
						var digits=7;
						var lat=storeItem.get('lat');
						var lon=storeItem.get('lon');

						// show marker on map
						setMoveableMarker(lat, lon);

						//set digit number, convert to string and replace "." with ","
						lat=(Math.floor(lat*Math.pow(10,digits))/Math.pow(10,digits)+'').replace(".",",");
						lon=(Math.floor(lon*Math.pow(10,digits))/Math.pow(10,digits)+'').replace(".",",");
						//tooltip text
						this.setTitle('Direction: '+ storeItem.get('direction') +'<br>Height: ' + elevation + ' m <br> Latitude: '+ lat + '<br> Longitude: '+ lon);

					}
				}
			}]
		};
		//add chart to 'chartContainer' in profile window
		Ext4.getCmp('chartContainer').add(elevationChart);
	}

	/**
	 * function: createProfileWindow()
	 * description: function creates main profile window, which holds chart, slider and numberfield
	 */
	window.createProfileWindow = function () {
		// detect lowest value from data and save it in 'minElevation'
		minElevation=Math.floor(elevationStore.min('elevation'));
		//round minimum value to 50er
		minElevation=(Math.floor(minElevation/50)*50);

		//detect highest value from data
		maxElevation=Math.floor(elevationStore.max('elevation'));
		//round maximum value to next higher hundreder and add 100
		maxElevation=(Math.floor(maxElevation/100)*100)+100;

		//create window component
		win = Ext4.createWidget('window', {
			id: 'chartWindow',
			width: 700,
			height: 400,
			x: 100,
			y: 100,
			style: 'border: 1px solid #666',
			hidden: false,
			maximizable: true,
			title: 'Height Profile',
			renderTo: Ext4.getBody(),
			layout: 'fit',
			items:[{
				xtype:'panel',
				style: 'border: 1px solid #666',
				layout: {
					type: 'hbox',
					align: 'stretch'
				},
				items:[{
					xtype: 'panel',
					flex: 1,
					border:true,
					height:100,
					minWidth:100,
					layout: 'border',
					items:[heightSlider,sliderLabel,createHeightStartValueField(minElevation,maxElevation)]
				}
				,{
					xtype: 'container',
					id: 'chartContainer',
					flex: 8,
					border: true,
					height: 450,
					layout: {
						type: 'fit'
					},
					items:[]//leave item empty, because it gets generated and added through createElevationChart()-function
				}]
			}	]

		});
		createElevationChart(minElevation,maxElevation);
	}
	/**
	 * function: closeProfileWindow()
	 * description: Function closes profile window
	 */
	window.closeProfileWindow = function () {
		if (win != undefined) {
			win.destroy();
		}
	}
	/**
	 * function: drawChart(elevationArray, pathCollection)
	 * description: Function generates data for JsonStore from result of elevation service
	 * and loads it into elevationStore. After doing this, chart gets redrawn with new data.
	 * parameters:
	 * -    elevationArray:    return array from elevation service. Fields:
	 * 								elevation
	 *								latitude
	 * 								longitude
	 * 								breakPoint = null // if not a breakpoint
	 * 								breakPoint.azimuth // [rad]
	 * 								breakPoint.directionString // N, E, SW, etc.
	 * 								breakPoint.index // segment index
	 *
	 * -    pathCollection:    (const) array with the following attributes per items:
	 *                              from (current projection)
	 *                              to (current projection)
	 *                              fromLonLat (OpenLayer.LonLat, WGS84, deg)
	 *                              toLonLat (OpenLayer.LonLat, WGS84, deg)
	 *                              segmentLength (km)
	 *                              azimuth (rad)
	 *                              directionString
	 *                              cumulativeLength (km)
	 */
	window.drawChart = function (elevationArray, pathCollection) {
		elevationStore.clearFilter(true);
		elevationStore.loadData(generateElevationDataFromResults(elevationArray, pathCollection.totalLength));
	}
	/**
	 * function: filterDataByMinValue(Number min)
	 * description: function loops through currentDataStore and checks if each value is bigger than passed min-value.
	 * 				When value is smaller then min-value, it gets set to min-value in order to still display it in chart at the bottom.
	 * 				Filter-function of Store-class wouldn't display it.
	 * parameters:
	 * -    min:    minimum value from starting y-value-numberfield.
	 * return:  Array retData: Array with updated elevations
	 * */
	function filterDataByMinValue(min) {
		var retData=cloneArray(currentStoreData);
		for (var i = 0; i < retData.length; i++) {
			if(retData[i].elevation<=min) {
				retData[i].elevation=min;
			}
		}
		return retData;
	}

});
/**
 * function: cloneArray(Array soureArr)
 * description: recursive function duplicates array
 * parameters:
 * -    soureArr:    source-array
 * return:  Array clonedArr: copy of array
 * */
function cloneArray(soureArr) {
	var clonedArr = (soureArr instanceof Array) ? [] : {};
	for (i in soureArr) {
		if (i == 'clone')
			continue;
		if (soureArr[i] && typeof soureArr[i] == "object") {
			clonedArr[i] = cloneArray(soureArr[i]);
		} else
			clonedArr[i] = soureArr[i]
	}
	return clonedArr;
};