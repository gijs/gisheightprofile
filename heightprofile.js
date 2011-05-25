var mapPanel = null; // Global GeoExt.MapPanel object.

/**
 * function: Ext.onReady()
 * description: Gets called by the ExtJS3 framework when the page is ready.
 */
Ext.onReady(function () {
    var map = new OpenLayers.Map();

    var gphy = new OpenLayers.Layer.Google("Google Physical", {
        type: google.maps.MapTypeId.TERRAIN
    });
    var gmap = new OpenLayers.Layer.Google("Google Streets", {
        numZoomLevels: 20
    });
    var osm = new OpenLayers.Layer.OSM();
    var ghyb = new OpenLayers.Layer.Google("Google Hybrid", {
        type: google.maps.MapTypeId.HYBRID,
        numZoomLevels: 20
    });
    var gsat = new OpenLayers.Layer.Google("Google Satellite", {
        type: google.maps.MapTypeId.SATELLITE,
        numZoomLevels: 22
    });

    map.addLayers([gphy, gmap, osm, ghyb, gsat]);
    map.addControl(new OpenLayers.Control.LayerSwitcher());
    map.addControl(new OpenLayers.Control.OverviewMap({ maximized : true,
                                                        autoPan   : false }));
    // map.addControl(new OpenLayers.Control.MousePosition()); // text overlap

    var markerLayer = new OpenLayers.Layer.Markers("Markers");
    map.addLayer(markerLayer);

    mapPanel = new GeoExt.MapPanel({
        map: map,
        region: 'center',
        zoom: 6,
        tbar: new Ext.Toolbar(),
        center: new OpenLayers.LonLat(11.019287, 51.041394).transform(
        new OpenLayers.Projection("EPSG:4326"), map.getProjectionObject()),
        items: [{
             xtype: "gx_zoomslider",
             vertical: true,
             height: 100,
             x: 15,
             y: 150,
             plugins: new GeoExt.ZoomSliderTip()
        }]
    });

    new Ext.Panel({
        title: "Elevation Profile",
        layout: 'fit',
        renderTo: 'gxmap',
        //autoWidth: true,
        height: 700,
        items: [mapPanel]
    });

    // Profile draw tool
    initProfileTool(mapPanel);
});

/**
 * function: initProfileTool()
 * description: Initialize functions to measure a profile on the map. This
 * function will add a button to the map panel.
 * data.
 * parameters:
 * -    mapPanel:    GeoExt.MapPanel
 */
function initProfileTool(mapPanel)
{
    // style the sketch fancy
    var sketchSymbolizers = {
        "Point": {
            pointRadius: 4,
            graphicName: "square",
            fillColor: "white",
            fillOpacity: 1,
            strokeWidth: 1,
            strokeOpacity: 1,
            strokeColor: "#333333"
        },
        "Line": {
            strokeWidth: 5,
            strokeOpacity: 1,
            strokeColor: "#FF1111",
            strokeDashstyle: "dot"
        },
        "Polygon": {
            strokeWidth: 2,
            strokeOpacity: 1,
            strokeColor: "#666666",
            fillColor: "white",
            fillOpacity: 0.3
        }
    };
    var style = new OpenLayers.Style();
    style.addRules([
            new OpenLayers.Rule({symbolizer: sketchSymbolizers})
            ]);
    var styleMap = new OpenLayers.StyleMap({"default": style});

    // add profile tool to the map panel
    var profileControl = new OpenLayers.Control.Measure(OpenLayers.Handler.Path, {
        eventListeners: {
            measure: function (evt) {
                onProfilePathComplete(evt);
            },
            measurepartial: function(evt) {
                onProfilePathPartial(evt);
            }
        },
        persist: true,
        handlerOptions: {
            layerOptions: { styleMap: styleMap }
        }
    });
    mapPanel.map.addControl(profileControl);

    var toggleGroup = "measure controls";
    var profileButton = new Ext.Button({
        text: 'Draw height profile',
        enableToggle: true,
        toggleGroup: toggleGroup,
        toggleHandler: function (item, pressed) {
            if (pressed) {
                profileControl.activate();
            } else {
                clearAllMarkers();
                profileControl.deactivate();
            }
        }
    });
    profileButton.setIcon('ext-3.3.1/examples/shared/icons/fam/folder_go.png');
    mapPanel.getTopToolbar().addButton(profileButton);
}

/**
 * function: onProfilePathComplete(evt)
 * description: Gets called when the user has drawn a path with the profile line
 * tool. This function prepares an array (segmentArray) which contains
 * all the informations of the drawn line segments (coordinates, length, azimuth
 * etc.)
 * parameters:
 * -    evt:    OpenLayers.Control.Measure "measure" event
 */
function onProfilePathComplete(evt)
{
    var i;
    var pointCount = evt.geometry.components.length;
    var from; // OpenLayers Point
    var to;  // OpenLayers Point
    var fromEllipsoidal; // x, y
    var toEllipsoidal; // x, y
    var fromLonLat; // lon, lat (OpenLayer.LonLat object) in [deg]
    var toLonLat; // lon, lat (OpenLayer.LonLat object) in [deg]
    var segmentLength; // [km]
    var totalLength = 0; // [km]
    var azimuth; // azimuth in [rad]
    var directionString; // direction of the segment: N, NE, E, SE, S a.s.o
    var segmentArray = []; // collect all the segments in this array
    var srcProj = mapPanel.map.getProjectionObject(); // current map projection
    var wgs84 = new OpenLayers.Projection("EPSG:4326"); // let's store wgs84 coordinates

    // Let's remove the older markers first
    clearAllMarkers();
    // Add first marker:
    addMarkerToMap(evt.geometry.components[0].x,
                   evt.geometry.components[0].y, 0);
    for (i = 1; i < pointCount; i++) {
        from            = evt.geometry.components[i-1];
        to              = evt.geometry.components[i];
        fromEllipsoidal = from.clone().transform(srcProj, wgs84); // transform to wgs84
        toEllipsoidal   = to.clone().transform(srcProj, wgs84);
        fromLonLat      = new OpenLayers.LonLat(fromEllipsoidal.x, fromEllipsoidal.y);
        toLonLat        = new OpenLayers.LonLat(toEllipsoidal.x, toEllipsoidal.y);
        segmentLength   = OpenLayers.Util.distVincenty(fromLonLat, toLonLat);
        azimuth         = azimuthApprox(from.y, from.x, to.y, to.x); // use directly x,y
        directionString = directionStringFromAzimuth(azimuth); // N, NE, E, SW etc.

        segmentArray.push({   from            : from,
                              to              : to,
                              fromLonLat      : fromLonLat,
                              toLonLat        : toLonLat,
                              segmentLength   : segmentLength,
                              azimuth         : azimuth,
                              directionString : directionString,
                              cumulativeLength: totalLength
                          });

        totalLength += segmentLength;
        addMarkerToMap(to.x, to.y, i);
    }

    // now you can use segmentArray to update the graph
    // total length:
    console.log('Profile line on map:');
    console.log('Total length [km]: ' + totalLength);
    console.log('Line segments: ' + String(pointCount-1));
    for (i = 0; i < segmentArray.length; i++) {
        console.log('Segment:');

        console.log('  From [WGS84, deg]: ' +
                       segmentArray[i].fromLonLat.lon +
                       ' ' +
                       segmentArray[i].fromLonLat.lat);
        console.log('  To [WGS84, deg]: ' +
                       segmentArray[i].toLonLat.lon +
                       ' ' +
                       segmentArray[i].toLonLat.lat);
        console.log('  Segment length [km]: ' + segmentArray[i].segmentLength);
        console.log('  Azimuth [deg]: ' + segmentArray[i].azimuth*180/Math.PI);
        console.log('  Direction: ' + segmentArray[i].directionString);
    }
    console.log('');

    var pathCollection = {
        segmentArray : segmentArray,
        totalLength  : totalLength
    };
    getHeightAlongPath(pathCollection, function(resultsArray, pathCollection)
                                       {
                                           window.closeProfileWindow();
                                           drawChart(resultsArray, pathCollection);
                                           window.createProfileWindow();
                                       });
}

function onProfilePathPartial(evt)
{
    // we could do something cool and dynamic here
}

/**
 * function: addMarkerToMap(lat, lon, markerIcon)
 * description: Adds a marker to the map's "Marker" layer.
 * This function is supposed to be used by the profile draw tool.
 * parameters:
 * -    x         : Longitude of the new marker (native projection)
 * -    y         : Latitude of the new marker (native projection)
 * -    markerIndex : Number of icon to be used (0 = A, 1 = B, ...)
 */
function addMarkerToMap(x, y, markerIndex)
{
    var markerLayerArray = mapPanel.map.getLayersByName("Markers");
    if (markerLayerArray.length != 1) {
        console.log('No marker layer found');
        return;
    }
    var markerLayer = markerLayerArray[0];

    // convert to a character from A-Z
    markerIndex = Math.min(markerIndex, 25);
    var markerLetter = String.fromCharCode(65+markerIndex);

    var iconURL = "img/red_Marker" + markerLetter + ".png";
    var size    = new OpenLayers.Size(20,34);
    var offset  = new OpenLayers.Pixel(-(size.w/2), -size.h);
    var icon    = new OpenLayers.Icon(iconURL, size, offset);
    markerLayer.addMarker(new OpenLayers.Marker(new OpenLayers.LonLat(x, y),
                          icon));
}

/**
 * function: clearAllMarkers()
 * description: Remove all markers from the marker layer.
 */
function clearAllMarkers()
{
    var i;
    var markerLayerArray = mapPanel.map.getLayersByName("Markers");
    if (markerLayerArray.length != 1) {
        return;
    }
    var markerLayer = markerLayerArray[0];
    var markerArray = markerLayer.markers;

    for (i = 0; i < markerArray.length; i++) {
        markerArray[i].destroy();
    }
    markerLayer.clearMarkers();
}

/**
 * function: setMoveableMarker(lat, lon)
 * description: Set the moveable marker to a position
 * parameters:
 * -    lat       : Longitude of the new marker (WGS84)
 * -    lon       : Latitude of the new marker (WGS84)
 */
function setMoveableMarker(lat, lon)
{
    var i;
    var markerLayerArray = mapPanel.map.getLayersByName("Markers");
    if (markerLayerArray.length != 1) {
        return;
    }
    var markerLayer = markerLayerArray[0];
    var markerArray = markerLayer.markers;

     // convert wgs84 input from function arguments to current system
    var nativeProj  = mapPanel.map.getProjectionObject();
    var wgs84       = new OpenLayers.Projection("EPSG:4326");
    var pWGS84      = new OpenLayers.LonLat(lon, lat);
    var pNative     = pWGS84.clone().transform(wgs84, nativeProj);

    // if we already have a moveable marker, just update the position
    for (i = 0; i < markerArray.length; i++) {
        if (markerArray[i].isMoveableMarker == true) {
            var px = mapPanel.map.getLayerPxFromLonLat(pNative);
            markerArray[i].moveTo(px);
            markerArray[i].display(true);
            return;
        }
    }

    // We have not found our moveable marker layer, so we create it.
    // This is a sort of lazy loading.
    var iconURL = "img/blue_Marker.png";
    var size    = new OpenLayers.Size(20,34);
    var offset  = new OpenLayers.Pixel(-(size.w/2), -size.h);
    var icon    = new OpenLayers.Icon(iconURL, size, offset);
    var marker  = new OpenLayers.Marker(pNative, icon)
    marker.isMoveableMarker = true;
    markerLayer.addMarker(marker);
}

function clearMoveableMarker()
{
    var markerLayerArray = mapPanel.map.getLayersByName("Markers");
    if (markerLayerArray.length != 1) {
        return;
    }
    var markerLayer = markerLayerArray[0];
    var markerArray = markerLayer.markers;

    // searching for the marker and hiding it.
    for (var i = 0; i < markerArray.length; i++) {
        if (markerArray[i].isMoveableMarker == true) {
            markerArray[i].display(false);
            return;
        }
    }
}

