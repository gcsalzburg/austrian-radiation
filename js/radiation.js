import * as radiation_generate from './radiation_generate.js';
import austria_poly from './austria-1km.js';

// Variables
var mapbox_token = 'pk.eyJ1IjoiZ2NzYWx6YnVyZyIsImEiOiJjam1pNm5uZmcwMXNyM3FtNGp6dTY3MGxsIn0.PmLPkI3T8UxjEIPnz7fxEA';

var increments = 5;                             // Number of sV in each isoband

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

var lat_m = -0.00767;                           // y=mx+c for linear interpolation (pixels -> lat/lng)
var lat_c = 49.00947;
var lng_m = 0.011317;
var lng_c = 9.516872;

// Variable allocation - do not edit
var range_sv = [100000000,0];
var range_names = ["",""];
var data_age;

var hover_isoband = null;

// Mapbox access token   
mapboxgl.accessToken = mapbox_token;
var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/gcsalzburg/cjmn85as2dzu12rpkmaw53hsj',
    center: [13.039088, 47.778603],
    zoom: 7,
    minZoom: 4,
    maxZoom: 12,
    maxBounds: pan_bounds
});
map.on('load', function () {
    initMap();
});



// ////////////////////////////////


function initMap() {

    // Zoom map to fit Austria
    map.fitBounds(radiation_generate.grid_extent);

    var items = {};

    // Get JSON list of places
    $.getJSON( "https://sfws.lfrz.at/json.php",{command: "getstations"}).done(function(data){
      $.each( data, function( key, val ) {
         items[key] = {
               "name": val.n,
               "x": val.x,
               "y": val.y,
               "lat":((lat_m*val.y)+lat_c),
               "lng":((lng_m*val.x)+lng_c),
               "val":0.0
         };
      });
      console.log(items);
      $.getJSON( "https://sfws.lfrz.at/json.php",{command: "getdata"}).done(function(data){
         $.each( data.values, function( key, val ) {
               items[key].val = val.v;
               if(val.v > range_sv[1]){
                  range_sv[1] = val.v;
                  range_names[1] = items[key].name;
               }
               if(val.v < range_sv[0]){
                  range_sv[0] = val.v;
                  range_names[0] = items[key].name;
               }
               data_age = val.d; // save timestamp from data
         });
         build_heatmap(items);
         render_map();
         render_ui();
         render_geolocation();
      });     
   });
}

function fetch_json() {

}

function build_heatmap(items){

   // Calculate isoband intervals
   var intervals = radiation_generate.createintervals(
      Math.floor(range_sv[0]/increments)*increments,
      Math.ceil(range_sv[1]/increments)*increments,
      increments,
      unit
   );
   
   // Create an array of points from the heatmap data values (TODO : move this into $.getJSON above in future)
   var rawDataArray = [];
   $.each(items, function(k,v){
      var loc = turf.point([v.lng, v.lat], {radiation: v.val, station_name: v.name});
      rawDataArray.push(loc);
   });

   // Create featureCollection from data points
   var rawDataPoints = turf.featureCollection(rawDataArray);

   // Add "fake" duplicate points just outside the bounds to stretch coverage across whole of Austria
   var rawDataFeatures = rawDataPoints.features;
   rawDataFeatures.push(turf.point([15.451882,49.013285],{radiation: items["AT0716"].val})); // Waidhofen/Ybbs
   rawDataFeatures.push(turf.point([14.887182,49.032998],{radiation: items["AT0514"].val})); // Gmünd/NÖ
   rawDataFeatures.push(turf.point([14.549704,46.312700],{radiation: items["AT0305"].val})); // Bad Eisenkappel
   rawDataFeatures.push(turf.point([9.442690,47.210770], {radiation: items["AT1906"].val}));  // Feldkirch
   rawDataFeatures.push(turf.point([17.224055,48.144801],{radiation: items["AT0520"].val}));  // Hainburg
   rawDataFeatures.push(turf.point([17.225467,47.799404],{radiation: items["AT0104"].val}));  // Frauenkirchen
   rawDataPoints = turf.featureCollection(rawDataFeatures);

   // Generate isoband data
   var isodata = radiation_generate.points2isobands(rawDataPoints, intervals);

   var grid = isodata.grid;
   var croppedisobands = isodata.isobands;


   // Rendering begins below...

   // Set max/min values in text
   $("#max_reading").text(range_sv[1]);
   $("#min_reading").text(range_sv[0]);
   $("#max_station").text(range_names[1]);
   $("#min_station").text(range_names[0]);
   $("#last_data").text(timeSince(data_age));
                     
   // Add map source ready for rendering
   map.addSource("austria-outline", {"type": "geojson","data": austria_poly});
   map.addSource("stations", {"type": "geojson","data": rawDataPoints});
   map.addSource("raw-data", {"type": "geojson","data": rawDataPoints}); 
   map.addSource("isobands", {"type": "geojson","data": croppedisobands});
   map.addSource("grid", {"type": "geojson","data": grid});
}


// Render all data to map
function render_map(){

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
   /* if(calc_method=='average'){
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
   }*/

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
            "fill-opacity": 1,
      }
   });

   // Add unstructured data points to map
   map.addLayer({
      'id': 'stations',
      'type': 'circle',
      'source': 'stations',
      'layout': {
            'visibility': 'none'
      },
      'paint': {
            'circle-radius': {
               stops: [
                  [4, 4],
                  [8, 12],
                  [12, 30]
               ]
            },
            "circle-color": '#000000',
            "circle-opacity": 1,
            "circle-stroke-width": 2,
            "circle-stroke-color": '#ffffff'
      }
   });
}

function render_ui(){
   // Create toggle buttons for layers
   var toggle_layers = ['austria-outline', 'raw-data', 'grid', 'isobands', 'stations'];

   for (var i = 0; i < toggle_layers.length; i++) {
      var id = toggle_layers[i];

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
   map.on('click', 'stations', function (e) {
      new mapboxgl.Popup({className: "isoband_popup"})
            .setLngLat(e.lngLat)
            .setHTML(e.features[0].properties.station_name + " ("+e.features[0].properties.radiation+"nSv/h)")
            .addTo(map);
   });

   map.on('mouseenter', 'isobands', function (e) {
      map.getCanvas().style.cursor = 'pointer';
   }).on('mouseleave', 'isobands', function () {
      map.getCanvas().style.cursor = '';
   });

   map.on("mousemove", "isobands", function(e) {
      if (hover_isoband != e.features[0]) {
            var top_px = 500*(1-(e.features[0].properties.radiation_mid/300)); // more magic numbers!
            $("#scale_marker").removeClass("hide").css("top",top_px);
            hover_isoband = e.features[0];
      }
   });
   map.on("mouseleave", "isobands", function() {
      hover_isoband =  null;
      $("#scale_marker").addClass("hide");
   });
   
   $("#nerds").on('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      $(this).hide();
      $("#toggle_links").show();
   });
}

function render_geolocation(){

   // Find user location
   if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(function(position) {

         var user_loc = turf.point([position.coords.longitude, position.coords.latitude]);

         // Add user marker to the map
         map.addSource("user_location", {"type": "geojson","data": user_loc});
         map.addLayer({
            "id": "user_location",
            "type": "circle",
            "source": "user_location",
            'layout': {
               'visibility': 'visible'
            },
            'paint': {
               'circle-radius': 8,
               "circle-opacity": 0,
               "circle-stroke-width": 2,
               "circle-stroke-color": '#fff'
            }
         });
         map.addLayer({
            "id": "user_location_dot",
            "type": "circle",
            "source": "user_location",
            'layout': {
               'visibility': 'visible'
            },
            'paint': {
               'circle-radius': 5,
               "circle-color": '#fff',
               "circle-opacity": 1,
            }
         });

         // Is user in Austria?
         if(turf.booleanPointInPolygon(user_loc, austria_poly)){

            // Work out where they are in words with reverse geocoding:
            const reverse_mapbox_url = "https://api.mapbox.com/geocoding/v5/mapbox.places/"+position.coords.longitude+","+position.coords.latitude+".json";
            $.getJSON(reverse_mapbox_url,{access_token: mapboxgl.accessToken}).done(function(data){

               var place_name = null;
               // Pass one, look for a "place" e.g. "Grödig, Salzburg, Austria"
               data.features.forEach(function(f) {
                  if(f.place_type[0] == "place"){
                     place_name = f.place_name;
                  }
               });  
               if(place_name == null){
                  // Pass one, look for a "region" e.g. "Salzburg, Austria"
                  data.features.forEach(function(f) {
                     if(f.place_type[0] == "region"){
                           place_name = f.place_name;
                     }
                  }); 
               }

               if(place_name){
                  // What's the radiation here:
                  var user_radiation = radiation_generate.radiation_at(user_loc);
                  if(user_radiation){
                     $("#my_radiation").text("Background radiation in "+place_name.replace(/, Austria/gi, '')+": "+user_radiation+"nSv/h");
                  }
               }else{
                  $("#my_radiation").hide();
               }
               }
            );
         }else{
            $("#my_radiation").hide();
         }
      },function(){
         // Location was not available.
      });
   } else {
      // Not possible to get location
   }
}

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