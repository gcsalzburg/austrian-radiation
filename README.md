# Austrian Radiation #

> View the map live here!
> https://play.interactionmagic.com/austrian-radiation/


![Screenshot of page](https://www.designedbycave.co.uk/austrian-radiation/img/screenshot.png)

This project builds a map of the current background radiation levels across Austria. The data comes from 111 of the Austrian [Strahlenfrühwarnsystem](https://www.bmnt.gv.at/umwelt/strahlen-atom/strahlen-warn-system/sfws.html) (radiation early warning system) measurement stations.

Don't be alarmed by all the radiation! For comparison eating one banana gives you a 98nSv dose. One dental x-ray is equivalent to around a 7500nSv.

## Tools ##

This project is built with:

- [Mapbox GL JS](https://www.mapbox.com/mapbox-gl-js/api/)
- [Turf.js](http://turfjs.org/docs/)
- [Martinez polygon clipping](https://github.com/w8r/martinez)

## Summary ##

The concept was to provide a "rainfall weather-map" style display of radiation levels across Austria, using an open API discovered on the [SFWS](https://sfws.lfrz.at/) website. 

The key challenges was to convert an arbitary array of (non-geocoded) data points into a set of isobands. Turf provides an implementation of the Marching Squares algorithm, but the data still required a little massaging to get it into a working format. The map also compares the output from two other interpolation methods: nearest neighbour and vertex averaging. The GeoJSON format was used throughout. 

The transformation process for the data is as follows:

1. Read in JSON data from source API
2. Transform data (pixels to co-ordinates) and save into GeoJSON array
3. Calculate radiation level at each structured grid point across target area using one of various methods:
   1. Nearest neighbour (iteration over unstructured grid)
   2. Vertex averaging (create TIN polygons and average corner points)
   3. Interpolation (using @turf/interpolate)
4. Expand grid to deal with points outside of Austrian bounds and provide smooth isobands in next step
6. Calculate isobands using Marching Squares algorithm across structured grid
7. Crop isobands to border of Austria (1km outline used, 250m outline was much too large a file)
8. Display data

## Useful links ##

Some useful resources from the production of this experiment:

<aside class="notice">
TODO: Cleanup the list of links below
</aside>

### Resources & docs ###

- http://sfws.lfrz.at/json.php
- https://github.com/Turfjs/turf
- https://leafletjs.com/examples/geojson/
- Comparison of isoband algorithms http://emptypipes.org/2015/07/22/contour-comparison/
- Marching Squares implementation (not used in the end in favour of the Turf.js native implementation) https://github.com/RaumZeit/MarchingSquares.js
- Comparison of different intersect function speeds https://polygon-clipping.js.org/
- Useful GeoJSON/Turf examples https://joeyklee.github.io/geosandbox/hello-turf.html
- Country outlines source for Austria https://github.com/simonepri/geo-maps/blob/master/info/countries-land.md 

### Q&A support info ###

- Summary of interpolation of scattered data using Matlab (used as a basis for how to construct this algorithm) https://www.mathworks.com/help/matlab/math/interpolating-scattered-data.html
- How to add different styles and events to items in a FeatureCollection https://leafletjs.com/examples/choropleth/

### GeoJSON notes ###

- Good overview of GeoJSON https://macwright.org/2015/03/23/geojson-second-bite.html
- Loads of links and utils https://github.com/tmcw/awesome-geojson
- Sandboxes for Leaflet, etc https://joeyklee.github.io/geosandbox/


## Other useful notes ##

Turf.js docs can be usefully supplemented with notes on each individual package page.

Turf intersect did not work reliably on MultiPolygons, hence Martinez was used. Another option would have been to [iterate over and split the shape into multiple Polygons](https://gis.stackexchange.com/questions/121396/convert-multipolygon-geojson-to-multiple-geojson-polygons) but this didn't seem very efficient!

Always read the Github issues and docs - you find things not yet in the official documentation! (e.g: https://github.com/Turfjs/turf/issues/1031). Although using a grid mask on the interpolate options didn't work, since the function snaps to the size of the data. So we need some fake data points!

Stupid ordering!! https://macwright.org/lonlat/

Can add multiple clip paths if needed: https://stackoverflow.com/questions/37644696/is-it-possible-to-have-multiple-masks-with-clip-path. Use percentages to scale as screen resizes.



### Scaling maths ###

```
// Scaling
// PLACE        LAT        LONG       X    Y
// Nauders      46.891674  10.501469  87   276
// Zistersdorf  48.541407  16.759886  640  61

// X -> LONG (m=0.011317, c=9.516872)
// Y -> LAT (m=-0.00767, c=49.00947) 
```
