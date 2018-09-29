
// Variables
var increments = 5;                             // Number of sV in each isoband
var grid_size = 10;                             // Distance between grid points, smaller = slower (km)
var grid_extent = [9.25, 46.25, 17.45, 49.1];   // Size of grid to produce
var interp_weight = 10;                         // Exponent decay constant for interpolation grid (bigger = faster decay)
var calc_method = 'interpolate';                // nearest || average || interpolate
var unit = 'nSv/h';                             // unit of radiation values
var pan_bounds = new mapboxgl.LngLatBounds(     // Pan boundary for map interaction
    [-18.166682, 28.605120],
    [40.239179, 61.138856]
);
var colour_scale = [                            // Gradient colour scale for radiation values (nSv/h)
    [0,   '#c0dbc2'],                           // http://colorzilla.com/gradient-editor/#c0dbc2+1,33ff30+16,4eb50a+40,fcfc2f+60,ff770f+75,ff0f0f+100 
    [48,  '#4eb50a'],
    [120, '#33ff30'],
    [180, '#fcfc2f'],
    [225, '#ff770f'],
    [300, '#ff0f0f']
];

// Outline of Austria
var austria_poly = JSON.parse(austria_outline_json);

// Variable allocation - do not edit
var range_sv = [100000000,0];
var range_names = ["",""];
var data_age;
var lower_bound;                // For isobands
var upper_bound;                // For isobands

var hover_isoband = null;

// Mapbox access token   
mapboxgl.accessToken = 'pk.eyJ1IjoiZ2NzYWx6YnVyZyIsImEiOiJjam1pNm5uZmcwMXNyM3FtNGp6dTY3MGxsIn0.PmLPkI3T8UxjEIPnz7fxEA';

var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/gcsalzburg/cjmn85as2dzu12rpkmaw53hsj',
    center: [13.388446, 47.414591],
    zoom: 7,
    minZoom: 4,
    maxZoom: 12,
    maxBounds: pan_bounds
});

map.on('load', function () {
    initMap();
});


function initMap() {

    var items = {};

    // Get JSON list of places
    $.getJSON( "https://sfws.lfrz.at/json.php",{command: "getstations"}).done(function(data){
        $.each( data, function( key, val ) {
            items[key] = {
                "n": val.n,
                "x": val.x,
                "y": val.y,
                "lat":((-0.00767*val.y)+49.00947),  // Magic numbers!
                "lng":((0.011317*val.x)+9.516872),
                "val":0.0
            };
        });
        $.getJSON( "https://sfws.lfrz.at/json.php",{command: "getdata"}).done(function(data){
            $.each( data.values, function( key, val ) {
                items[key].val = val.v;
                if(val.v > range_sv[1]){
                    range_sv[1] = val.v;
                    range_names[1] = items[key].n;
                }
                if(val.v < range_sv[0]){
                    range_sv[0] = val.v;
                    range_names[0] = items[key].n;
                }
                data_age = val.d; // save timestamp from data
            });
            build_heatmap(items);
        });
        
    });


    function build_heatmap(items){

        // Set max/min values in text
        $("#max_reading").text(range_sv[1]);
        $("#min_reading").text(range_sv[0]);
        $("#max_station").text(range_names[1]);
        $("#min_station").text(range_names[0]);
        $("#last_data").text(timeSince(data_age));
        
        // Update bounds for graphics now
        lower_bound = Math.floor(range_sv[0]/increments)*increments;
        upper_bound = Math.ceil(range_sv[1]/increments)*increments;

        // Add Austria layer to map
        map.addSource("austria-outline", {"type": "geojson","data": austria_poly});

        // Create an array of points from the heatmap data values (TODO : move this into $.getJSON above in future)
        var rawDataArray = [];
        $.each(items, function(k,v){
            var loc = turf.point([v.lng, v.lat], {radiation: v.val});
            rawDataArray.push(loc);
        });

        // Create featureCollection of unstructured data points
        var rawDataPoints = turf.featureCollection(rawDataArray);

        // Add unique identifier to each point (e.g. to be used in back reference from TIN coords)
        var index = 0;
        rawDataPoints.features.forEach(function(f) {
            f.properties.ref = index;
            index++;
        });

        // Add raw-data as a map source
        map.addSource("raw-data", {"type": "geojson","data": rawDataPoints});

        // Choose which method to calculate the radiation value for the points by
        switch(calc_method){

            // Method A: Calculate which unstructured data point each point is nearest to    
            case 'nearest': 

                // Create the grid
                var grid = turf.pointGrid(grid_extent, grid_size, {units: 'kilometres'});

                grid.features.forEach(function(f) {
                    var near_point = turf.nearestPoint(f,rawDataPoints);
                    f.properties.radiation = near_point.properties.radiation;
                });        
                break; 

            // Method B: Calculate TIN polygons and determine which polygon each point lies within
            case 'average':

                // Create TIN polygons
                var tin_polys = turf.tin(rawDataPoints, 'ref');

                // Add radiation sum as property to each tin poly.
                tin_polys.features.forEach(function(polyfeat) {
                    var radiation_sum = 0;
                    var fp = polyfeat.properties;
                    rawDataPoints.features.forEach(function(rawPoint) {
                        var rpp = rawPoint.properties;
                        if((rpp.ref == fp.a)||(rpp.ref == fp.b)||(rpp.ref == fp.c)){
                            radiation_sum += rpp.radiation;
                        }
                    });
                    fp.radiation = radiation_sum/3;
                });

                // Add TIN polys as a map source
                map.addSource("tin-polys", {"type": "geojson","data": tin_polys});

                // Create the grid
                var grid = turf.pointGrid(grid_extent, grid_size, {units: 'kilometres'});

                // Calculate which tin poly each point is inside
                // TODO: Change from forEach to different loop format to enable break out after test passes
                grid.features.forEach(function(f) {
                    f.properties.radiation = 0;
                    tin_polys.features.forEach(function(tin_feat) {
                        if(turf.booleanPointInPolygon(f,tin_feat)){
                            f.properties.radiation = tin_feat.properties.radiation;
                        }
                    });
                });
                break;

            // Method C: Calculate which unstructured data point each point is nearest to    
            case 'interpolate': 

                // Add "fake" duplicate points just outside the bounds to stretch coverage across whole of Austria
                var rawDataFeatures = rawDataPoints.features;
                rawDataFeatures.push(turf.point([15.451882,49.013285],{radiation: items["AT0716"].val})); // Waidhofen/Ybbs
                rawDataFeatures.push(turf.point([14.887182,49.032998],{radiation: items["AT0514"].val})); // Gmünd/NÖ
                rawDataFeatures.push(turf.point([14.549704,46.312700],{radiation: items["AT0305"].val})); // Bad Eisenkappel
                rawDataFeatures.push(turf.point([9.442690,47.210770],{radiation: items["AT1906"].val}));  // Feldkirch
                rawDataFeatures.push(turf.point([17.224055,48.144801],{radiation: items["AT0520"].val}));  // Hainburg
                rawDataFeatures.push(turf.point([17.225467,47.799404],{radiation: items["AT0104"].val}));  // Frauenkirchen
                rawDataPoints = turf.featureCollection(rawDataFeatures);

                // Create interpolation grid
                var grid = turf.interpolate(rawDataPoints, grid_size, {
                    gridType: 'points',
                    property: 'radiation',
                    units: 'kilometres',
                    weight: interp_weight
                })
                break;
        }

        // Now deal with the points outside the bounds of the measured values.
        // We give these a nearest-neighbour value, to fill out the small edges of the outline of Austria which would otherwise be missed
        grid.features.forEach(function(f) {
            if(f.properties.radiation == 0){
                f.properties.radiation = turf.nearestPoint(f,rawDataPoints).properties.radiation;
            }
        });

        // Add grid as a map source
        map.addSource("grid", {"type": "geojson","data": grid});

        // Calculate isoband intervals and properties
        var breaks = [];
        var band_properties = [];
        for(i=lower_bound; i<=upper_bound; i+=increments){
            breaks.push(i);
            band_properties.push({
                'radiation_lower':  i,
                'radiation_mid':    Math.round(i+(increments/2)),
                'description':      i+" - "+(i+increments)+" "+unit
            });
        }

        // Create the isobands
        var isobands = turf.isobands(grid,breaks,{zProperty: 'radiation', breaksProperties: band_properties});

        // Crop them to the size of Austria (which is the only area we have valid data for)
        // We use Martinez for this
        var croppedisobands_array = [];
        var i=0;
        isobands.features.forEach(function(f) {
            // Filter out isobands with no geometry in them to avoid Martinez crashing
            if(f.geometry.coordinates.length > 0){
                croppedisobands_array.push({
                    type: "Feature",
                    properties: f.properties,
                    geometry: {
                        type: "MultiPolygon",
                        coordinates: martinez.intersection(f.geometry.coordinates,austria_poly.geometry.coordinates)
                    }
                });
            }
        });  
        var croppedisobands = turf.featureCollection(croppedisobands_array);  

        // Add isobands as a map source
        map.addSource("isobands", {"type": "geojson","data": croppedisobands});


        //
        // Rendering tasks happen below
        //
        
        // Add outline of Austria to map
        map.addLayer({
            "id": "austria-outline",
            "type": "fill",
            "source": "austria-outline",
            'layout': {
                'visibility': 'none'
            },
            "paint": {
                "fill-color": "#ffffff",
                "fill-opacity": 0.5
            }
        });

        // Add unstructured data points to map
        map.addLayer({
            'id': 'raw-data',
            'type': 'circle',
            'source': 'raw-data',
            'layout': {
                'visibility': 'none'
            },
            'paint': {
                'circle-radius': {
                    property: 'radiation',
                    stops: [
                        [{zoom: 8, value: range_sv[0]}, 20],
                        [{zoom: 8, value: range_sv[1]}, 50]
                    ]
                },
                "circle-color": {
                    property: 'radiation',
                    stops: colour_scale
                },
                "circle-opacity": 0.4
            }
        });

        
        // Add TIN polygons to the map
        if(calc_method=='average'){
            map.addLayer({
                "id": "tin-polys",
                "type": "fill",
                "source": "tin-polys",
                'layout': {
                    'visibility': 'none'
                },
                'paint': {
                    "fill-color": {
                        'property': 'radiation',
                        'stops': colour_scale
                    },
                    "fill-opacity": 0.4,
                    'fill-outline-color': '#ffffff'
                }
            });
        }

        // Add unstructured data points to map
        map.addLayer({
            'id': 'grid',
            'type': 'circle',
            'source': 'grid',
            'layout': {
                'visibility': 'none'
            },
            'paint': {
                'circle-radius': 5,
                'circle-color': {
                    'property': 'radiation',
                    'stops': colour_scale
                },
                'circle-opacity': 1
            }
        });
        
        // Draw isobands
        map.addLayer({
            "id": "isobands",
            "type": "fill",
            "source": "isobands",
            'layout': {
                'visibility': 'visible'
            },
            'paint': {
                "fill-color": {
                    property: 'radiation_lower',
                    stops: colour_scale
                },
                "fill-opacity": 0.9
            }
        });

        // Create toggle buttons for layers
        var toggleableLayerIds = ['austria-outline', 'raw-data', 'grid', 'isobands'];

        for (var i = 0; i < toggleableLayerIds.length; i++) {
            var id = toggleableLayerIds[i];

            var link = document.createElement('a');
            link.href = '#';
            if(map.getLayoutProperty(id, 'visibility') == 'visible'){
                link.className = 'active';
            }
            link.textContent = id;

            link.onclick = function (e) {
                var clickedLayer = this.textContent;
                e.preventDefault();
                e.stopPropagation();

                var visibility = map.getLayoutProperty(clickedLayer, 'visibility');

                if (visibility === 'visible') {
                    map.setLayoutProperty(clickedLayer, 'visibility', 'none');
                    this.className = '';
                } else {
                    this.className = 'active';
                    map.setLayoutProperty(clickedLayer, 'visibility', 'visible');
                }
            };

            var layers = document.getElementById('toggle_links');
            layers.appendChild(link);
        }

        // Add click and mouse hover effects
        map.on('click', 'isobands', function (e) {
            new mapboxgl.Popup({className: "isoband_popup"})
                .setLngLat(e.lngLat)
                .setHTML(e.features[0].properties.description)
                .addTo(map);
        });

        map.on('mouseenter', 'isobands', function (e) {
            map.getCanvas().style.cursor = 'pointer';
        }).on('mouseleave', 'isobands', function () {
            map.getCanvas().style.cursor = '';
        });

        map.on("mousemove", "isobands", function(e) {
            if (hover_isoband != e.features[0]) {
                var top_px = 500*(1-(e.features[0].properties.radiation_mid/300));
                $("#scale_marker").removeClass("hide").css("top",top_px); // more magic numbers!
                hover_isoband = e.features[0];
            }
        });
        map.on("mouseleave", "isobands", function() {
            hover_isoband =  null;
            $("#scale_marker").addClass("hide");
        });

    }
};

$("#nerds").on('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    $(this).hide();
    $("#toggle_links").show();
});

function timeSince(timeStamp) {
    var now = new Date();
    var secondsPast = (now.getTime()/1000) - timeStamp;
    if(secondsPast < 60){
      return parseInt(secondsPast) + ' second' + ((parseInt(secondsPast) > 1) ? "s" : "") + ' ago';
    }
    if(secondsPast < 3660){
      return parseInt(secondsPast/60) + ' minute' + ((parseInt(secondsPast/60) > 1) ? "s" : "") + ' ago';
    }
    if(secondsPast <= 86400){
      return parseInt(secondsPast/3600) + ' hour' + ((parseInt(secondsPast/3600) > 1) ? "s" : "") + ' ago';
    }
  }